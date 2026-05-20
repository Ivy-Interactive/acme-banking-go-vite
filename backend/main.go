package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "5000"
	}

	if err := initDB("bank.db"); err != nil {
		log.Fatalf("failed to init database: %v", err)
	}
	defer db.Close()

	if err := seedData(); err != nil {
		log.Fatalf("failed to seed data: %v", err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/login", handleLogin)
	mux.HandleFunc("POST /api/logout", requireAuth(handleLogout))
	mux.HandleFunc("GET /api/me", requireAuth(handleMe))
	mux.HandleFunc("GET /api/account", requireAuth(handleAccount))
	mux.HandleFunc("GET /api/transactions", requireAuth(handleTransactions))
	mux.HandleFunc("POST /api/deposit", requireAuth(handleDeposit))
	mux.HandleFunc("POST /api/withdraw", requireAuth(handleWithdraw))
	mux.HandleFunc("POST /api/transfer", requireAuth(handleTransfer))
	mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	srv := &http.Server{
		Addr:         "127.0.0.1:" + port,
		Handler:      withCORS(mux),
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("Acme Banking API listening on http://%s", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server error: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	log.Println("shutting down...")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

package main

import "net/http"

func buildMux() *http.ServeMux {
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
	return mux
}

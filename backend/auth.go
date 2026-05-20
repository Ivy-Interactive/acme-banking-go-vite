package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"strings"
	"time"
)

type ctxKey string

const userCtxKey ctxKey = "user"

type sessionUser struct {
	ID            int64
	Username      string
	FullName      string
	AccountNumber string
}

func newToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func createSession(userID int64) (string, time.Time, error) {
	token, err := newToken()
	if err != nil {
		return "", time.Time{}, err
	}
	expires := time.Now().Add(7 * 24 * time.Hour)
	if _, err := db.Exec("INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)", token, userID, expires); err != nil {
		return "", time.Time{}, err
	}
	return token, expires, nil
}

func lookupSession(token string) (*sessionUser, error) {
	row := db.QueryRow(`
		SELECT u.id, u.username, u.full_name, u.account_number
		FROM sessions s
		JOIN users u ON u.id = s.user_id
		WHERE s.token = ? AND s.expires_at > CURRENT_TIMESTAMP
	`, token)
	var u sessionUser
	if err := row.Scan(&u.ID, &u.Username, &u.FullName, &u.AccountNumber); err != nil {
		return nil, err
	}
	return &u, nil
}

func requireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		token := strings.TrimPrefix(auth, "Bearer ")
		if token == "" || token == auth {
			writeError(w, http.StatusUnauthorized, "missing or invalid Authorization header")
			return
		}
		user, err := lookupSession(token)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "invalid or expired session")
			return
		}
		ctx := context.WithValue(r.Context(), userCtxKey, user)
		next(w, r.WithContext(ctx))
	}
}

func currentUser(r *http.Request) *sessionUser {
	if u, ok := r.Context().Value(userCtxKey).(*sessionUser); ok {
		return u
	}
	return nil
}

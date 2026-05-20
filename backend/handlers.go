package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func decodeJSON(r *http.Request, dst any) error {
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	return dec.Decode(dst)
}

func formatCents(c int64) string {
	sign := ""
	if c < 0 {
		sign = "-"
		c = -c
	}
	return fmt.Sprintf("%s%d.%02d", sign, c/100, c%100)
}

type loginReq struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func handleLogin(w http.ResponseWriter, r *http.Request) {
	var req loginReq
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Username = strings.TrimSpace(strings.ToLower(req.Username))
	if req.Username == "" || req.Password == "" {
		writeError(w, http.StatusBadRequest, "username and password required")
		return
	}

	var (
		id            int64
		fullName      string
		accountNumber string
		passwordHash  string
	)
	err := db.QueryRow(
		"SELECT id, full_name, account_number, password_hash FROM users WHERE username = ?",
		req.Username,
	).Scan(&id, &fullName, &accountNumber, &passwordHash)
	if err == sql.ErrNoRows || (err == nil && passwordHash != hashPassword(req.Password)) {
		writeError(w, http.StatusUnauthorized, "invalid username or password")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}

	token, expires, err := createSession(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create session")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"token":      token,
		"expires_at": expires.Format(time.RFC3339),
		"user": map[string]any{
			"username":       req.Username,
			"full_name":      fullName,
			"account_number": accountNumber,
		},
	})
}

func handleLogout(w http.ResponseWriter, r *http.Request) {
	token := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	_, _ = db.Exec("DELETE FROM sessions WHERE token = ?", token)
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func handleMe(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	writeJSON(w, http.StatusOK, map[string]any{
		"username":       u.Username,
		"full_name":      u.FullName,
		"account_number": u.AccountNumber,
	})
}

func handleAccount(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	var balance int64
	if err := db.QueryRow("SELECT balance_cents FROM users WHERE id = ?", u.ID).Scan(&balance); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load account")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"username":         u.Username,
		"full_name":        u.FullName,
		"account_number":   u.AccountNumber,
		"balance_cents":    balance,
		"balance_formatted": formatCents(balance),
	})
}

type txRow struct {
	ID                 int64  `json:"id"`
	Kind               string `json:"kind"`
	AmountCents        int64  `json:"amount_cents"`
	AmountFormatted    string `json:"amount_formatted"`
	BalanceAfterCents  int64  `json:"balance_after_cents"`
	BalanceFormatted   string `json:"balance_after_formatted"`
	Description        string `json:"description"`
	Counterparty       string `json:"counterparty,omitempty"`
	CreatedAt          string `json:"created_at"`
}

func handleTransactions(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	limit := 50
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 200 {
			limit = n
		}
	}
	rows, err := db.Query(`
		SELECT id, kind, amount_cents, balance_after_cents, description, COALESCE(counterparty,''), created_at
		FROM transactions
		WHERE user_id = ?
		ORDER BY created_at DESC, id DESC
		LIMIT ?
	`, u.ID, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load transactions")
		return
	}
	defer rows.Close()

	out := make([]txRow, 0)
	for rows.Next() {
		var t txRow
		var created time.Time
		if err := rows.Scan(&t.ID, &t.Kind, &t.AmountCents, &t.BalanceAfterCents, &t.Description, &t.Counterparty, &created); err != nil {
			writeError(w, http.StatusInternalServerError, "scan error")
			return
		}
		t.AmountFormatted = formatCents(t.AmountCents)
		t.BalanceFormatted = formatCents(t.BalanceAfterCents)
		t.CreatedAt = created.Format(time.RFC3339)
		out = append(out, t)
	}
	writeJSON(w, http.StatusOK, out)
}

type amountReq struct {
	AmountCents int64  `json:"amount_cents"`
	Description string `json:"description"`
}

func handleDeposit(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	var req amountReq
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.AmountCents <= 0 {
		writeError(w, http.StatusBadRequest, "amount must be positive")
		return
	}
	if req.Description == "" {
		req.Description = "Deposit"
	}
	balance, err := applyChange(u.ID, "deposit", req.AmountCents, req.Description, "")
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"balance_cents":     balance,
		"balance_formatted": formatCents(balance),
	})
}

func handleWithdraw(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	var req amountReq
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.AmountCents <= 0 {
		writeError(w, http.StatusBadRequest, "amount must be positive")
		return
	}
	if req.Description == "" {
		req.Description = "Withdrawal"
	}
	balance, err := applyChange(u.ID, "withdraw", -req.AmountCents, req.Description, "")
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"balance_cents":     balance,
		"balance_formatted": formatCents(balance),
	})
}

type transferReq struct {
	ToAccount   string `json:"to_account"`
	AmountCents int64  `json:"amount_cents"`
	Description string `json:"description"`
}

func handleTransfer(w http.ResponseWriter, r *http.Request) {
	u := currentUser(r)
	var req transferReq
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.AmountCents <= 0 {
		writeError(w, http.StatusBadRequest, "amount must be positive")
		return
	}
	req.ToAccount = strings.TrimSpace(req.ToAccount)
	if req.ToAccount == "" || req.ToAccount == u.AccountNumber {
		writeError(w, http.StatusBadRequest, "invalid destination account")
		return
	}

	var (
		toID       int64
		toName     string
	)
	err := db.QueryRow("SELECT id, full_name FROM users WHERE account_number = ?", req.ToAccount).Scan(&toID, &toName)
	if err == sql.ErrNoRows {
		writeError(w, http.StatusBadRequest, "destination account not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "database error")
		return
	}

	desc := req.Description
	if desc == "" {
		desc = "Transfer"
	}

	tx, err := db.Begin()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "tx begin failed")
		return
	}
	defer tx.Rollback()

	var senderBalance int64
	if err := tx.QueryRow("SELECT balance_cents FROM users WHERE id = ?", u.ID).Scan(&senderBalance); err != nil {
		writeError(w, http.StatusInternalServerError, "balance read failed")
		return
	}
	if senderBalance < req.AmountCents {
		writeError(w, http.StatusBadRequest, "insufficient funds")
		return
	}
	newSender := senderBalance - req.AmountCents

	var recvBalance int64
	if err := tx.QueryRow("SELECT balance_cents FROM users WHERE id = ?", toID).Scan(&recvBalance); err != nil {
		writeError(w, http.StatusInternalServerError, "balance read failed")
		return
	}
	newRecv := recvBalance + req.AmountCents

	if _, err := tx.Exec("UPDATE users SET balance_cents = ? WHERE id = ?", newSender, u.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "update failed")
		return
	}
	if _, err := tx.Exec("UPDATE users SET balance_cents = ? WHERE id = ?", newRecv, toID); err != nil {
		writeError(w, http.StatusInternalServerError, "update failed")
		return
	}

	if _, err := tx.Exec(
		"INSERT INTO transactions (user_id, kind, amount_cents, balance_after_cents, description, counterparty) VALUES (?,?,?,?,?,?)",
		u.ID, "transfer_out", -req.AmountCents, newSender, desc, toName,
	); err != nil {
		writeError(w, http.StatusInternalServerError, "tx insert failed")
		return
	}
	if _, err := tx.Exec(
		"INSERT INTO transactions (user_id, kind, amount_cents, balance_after_cents, description, counterparty) VALUES (?,?,?,?,?,?)",
		toID, "transfer_in", req.AmountCents, newRecv, desc, u.FullName,
	); err != nil {
		writeError(w, http.StatusInternalServerError, "tx insert failed")
		return
	}

	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "commit failed")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"balance_cents":     newSender,
		"balance_formatted": formatCents(newSender),
		"recipient":         toName,
	})
}

func applyChange(userID int64, kind string, delta int64, description, counterparty string) (int64, error) {
	tx, err := db.Begin()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	var balance int64
	if err := tx.QueryRow("SELECT balance_cents FROM users WHERE id = ?", userID).Scan(&balance); err != nil {
		return 0, err
	}
	newBalance := balance + delta
	if newBalance < 0 {
		return 0, fmt.Errorf("insufficient funds")
	}
	if _, err := tx.Exec("UPDATE users SET balance_cents = ? WHERE id = ?", newBalance, userID); err != nil {
		return 0, err
	}
	if _, err := tx.Exec(
		"INSERT INTO transactions (user_id, kind, amount_cents, balance_after_cents, description, counterparty) VALUES (?,?,?,?,?,?)",
		userID, kind, delta, newBalance, description, counterparty,
	); err != nil {
		return 0, err
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return newBalance, nil
}

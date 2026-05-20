package main

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"time"

	_ "modernc.org/sqlite"
)

var db *sql.DB

func initDB(path string) error {
	var err error
	db, err = sql.Open("sqlite", path)
	if err != nil {
		return err
	}
	if err := db.Ping(); err != nil {
		return err
	}

	schema := `
	CREATE TABLE IF NOT EXISTS users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		username TEXT UNIQUE NOT NULL,
		password_hash TEXT NOT NULL,
		full_name TEXT NOT NULL,
		account_number TEXT UNIQUE NOT NULL,
		balance_cents INTEGER NOT NULL DEFAULT 0,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS transactions (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		kind TEXT NOT NULL,
		amount_cents INTEGER NOT NULL,
		balance_after_cents INTEGER NOT NULL,
		description TEXT NOT NULL,
		counterparty TEXT,
		created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id)
	);

	CREATE TABLE IF NOT EXISTS sessions (
		token TEXT PRIMARY KEY,
		user_id INTEGER NOT NULL,
		expires_at DATETIME NOT NULL,
		FOREIGN KEY (user_id) REFERENCES users(id)
	);

	CREATE INDEX IF NOT EXISTS idx_tx_user_created ON transactions(user_id, created_at DESC);
	`
	_, err = db.Exec(schema)
	return err
}

func hashPassword(plain string) string {
	h := sha256.Sum256([]byte("acme-bank-salt:" + plain))
	return hex.EncodeToString(h[:])
}

func seedData() error {
	var count int
	if err := db.QueryRow("SELECT COUNT(*) FROM users").Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	demo := []struct {
		username   string
		password   string
		fullName   string
		accountNum string
		balance    int64
	}{
		{"alice", "password", "Alice Anderson", "ACME-1001-2034", 1_250_00},
		{"bob", "password", "Bob Bennett", "ACME-1001-4521", 3_847_50},
		{"demo", "demo", "Demo User", "ACME-1001-0000", 500_00},
	}

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	for _, u := range demo {
		res, err := tx.Exec(
			"INSERT INTO users (username, password_hash, full_name, account_number, balance_cents) VALUES (?,?,?,?,?)",
			u.username, hashPassword(u.password), u.fullName, u.accountNum, u.balance,
		)
		if err != nil {
			return fmt.Errorf("insert user %s: %w", u.username, err)
		}
		uid, _ := res.LastInsertId()
		_, err = tx.Exec(
			"INSERT INTO transactions (user_id, kind, amount_cents, balance_after_cents, description, created_at) VALUES (?,?,?,?,?,?)",
			uid, "deposit", u.balance, u.balance, "Opening deposit", time.Now().Add(-30*24*time.Hour),
		)
		if err != nil {
			return err
		}
	}
	return tx.Commit()
}

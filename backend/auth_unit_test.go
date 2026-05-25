package main

import (
	"encoding/hex"
	"testing"
)

func TestNewToken(t *testing.T) {
	a, err := newToken()
	if err != nil {
		t.Fatalf("newToken: %v", err)
	}
	if len(a) != 64 {
		t.Errorf("token length = %d, want 64 hex chars", len(a))
	}
	if _, err := hex.DecodeString(a); err != nil {
		t.Errorf("token is not valid hex: %v", err)
	}

	b, err := newToken()
	if err != nil {
		t.Fatalf("newToken 2: %v", err)
	}
	if a == b {
		t.Error("two tokens were equal — randomness broken")
	}
}

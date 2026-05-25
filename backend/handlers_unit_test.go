package main

import "testing"

func TestFormatCents(t *testing.T) {
	cases := []struct {
		in   int64
		want string
	}{
		{0, "0.00"},
		{1, "0.01"},
		{99, "0.99"},
		{100, "1.00"},
		{1234, "12.34"},
		{125000, "1250.00"},
		{123456789, "1234567.89"},
		{-1, "-0.01"},
		{-1234, "-12.34"},
		{-125000, "-1250.00"},
	}
	for _, c := range cases {
		got := formatCents(c.in)
		if got != c.want {
			t.Errorf("formatCents(%d) = %q, want %q", c.in, got, c.want)
		}
	}
}

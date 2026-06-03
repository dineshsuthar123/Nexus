package db

import (
	"errors"
	"testing"

	"github.com/jackc/pgx/v5/pgconn"
)

func TestIsCRDBRetryError(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{
			name: "serialization failure",
			err:  &pgconn.PgError{Code: "40001"},
			want: true,
		},
		{
			name: "remote wall time",
			err:  errors.New("restart transaction: remote wall time is too far ahead"),
			want: true,
		},
		{
			name: "non retryable",
			err:  errors.New("duplicate key"),
			want: false,
		},
		{
			name: "nil",
			err:  nil,
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := isCRDBRetryError(tt.err); got != tt.want {
				t.Fatalf("expected %v, got %v", tt.want, got)
			}
		})
	}
}

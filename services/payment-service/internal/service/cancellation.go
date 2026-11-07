package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/nexus-rtp/payment-service/internal/db"
	"github.com/nexus-rtp/payment-service/internal/observability"
)

// CancelPaymentResponse represents a cancelled unsettled payment.
type CancelPaymentResponse struct {
	UETR        string    `json:"uetr"`
	Status      string    `json:"status"`
	ReasonCode  string    `json:"reasonCode"`
	CancelledAt time.Time `json:"cancelledAt"`
}

// CancelPayment cancels an unsettled payment and releases the debtor shard debit.
func (s *PaymentService) CancelPayment(ctx context.Context, uetrStr string, reasonCode string) (*CancelPaymentResponse, error) {
	ctx, span := observability.StartSpan(ctx, "PaymentService.CancelPayment")
	defer span.End()

	uetr, err := uuid.Parse(uetrStr)
	if err != nil {
		return nil, fmt.Errorf("invalid UETR: %w", err)
	}
	if strings.TrimSpace(reasonCode) == "" {
		reasonCode = "CUST"
	}

	var resp *CancelPaymentResponse
	err = s.pool.RetryTx(ctx, 3, func(tx pgx.Tx) error {
		transaction, err := s.transactionRepo.GetByUETRTx(ctx, tx, uetr)
		if err != nil {
			return fmt.Errorf("transaction not found: %w", err)
		}
		if err := db.ValidateTransition(transaction.Status, "CANCELLED"); err != nil {
			return err
		}

		// CreatePayment debits debtor shards before the transaction is settled.
		// Cancelling before settlement must put those funds back.
		if err := s.shardRepo.CreditShard(ctx, tx, transaction.DebtorAccountID, transaction.Amount); err != nil {
			return fmt.Errorf("failed to release debtor funds: %w", err)
		}

		if err := s.transactionRepo.UpdateStatus(ctx, tx, transaction.ID, "CANCELLED", reasonCode); err != nil {
			return fmt.Errorf("failed to update transaction status: %w", err)
		}

		eventPayload, err := json.Marshal(map[string]interface{}{
			"transactionId": transaction.ID.String(),
			"uetr":          transaction.UETR.String(),
			"status":        "CANCELLED",
			"reasonCode":    reasonCode,
		})
		if err != nil {
			return fmt.Errorf("failed to marshal outbox event payload: %w", err)
		}

		outboxEvent := &db.OutboxEvent{
			AggregateType: "transaction",
			AggregateID:   transaction.ID,
			EventType:     "payment.cancelled",
			Payload:       eventPayload,
			Topic:         db.TopicPaymentsCompleted,
			PartitionKey:  transaction.DebtorAccountID.String(),
		}
		if err := s.outboxRepo.Insert(ctx, tx, outboxEvent); err != nil {
			return err
		}

		resp = &CancelPaymentResponse{
			UETR:        uetrStr,
			Status:      "CANCELLED",
			ReasonCode:  reasonCode,
			CancelledAt: time.Now(),
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return resp, nil
}

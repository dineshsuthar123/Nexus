package email

import (
	"fmt"
	"net/smtp"

	"go.uber.org/zap"
)

// Sender is the interface for email dispatch.
type Sender interface {
	Send(to, subject, body string) error
}

// SMTPSender sends real emails via SMTP.
type SMTPSender struct {
	host     string
	port     int
	username string
	password string
	from     string
	logger   *zap.Logger
}

// NewSMTPSender creates a real SMTP sender.
func NewSMTPSender(host string, port int, username, password, from string, logger *zap.Logger) *SMTPSender {
	return &SMTPSender{
		host:     host,
		port:     port,
		username: username,
		password: password,
		from:     from,
		logger:   logger,
	}
}

// Send dispatches an email via SMTP.
func (s *SMTPSender) Send(to, subject, body string) error {
	addr := fmt.Sprintf("%s:%d", s.host, s.port)
	auth := smtp.PlainAuth("", s.username, s.password, s.host)

	msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n%s",
		s.from, to, subject, body)

	err := smtp.SendMail(addr, auth, s.from, []string{to}, []byte(msg))
	if err != nil {
		s.logger.Error("Failed to send email", zap.String("to", to), zap.Error(err))
		return fmt.Errorf("failed to send email: %w", err)
	}

	s.logger.Info("Email sent", zap.String("to", to), zap.String("subject", subject))
	return nil
}

// StubSender logs emails instead of sending (for dev/test).
type StubSender struct {
	logger *zap.Logger
	Sent   []SentEmail // exported for test assertions
}

// SentEmail records a dispatched email for testing.
type SentEmail struct {
	To      string
	Subject string
	Body    string
}

// NewStubSender creates a stub sender that logs instead of sending.
func NewStubSender(logger *zap.Logger) *StubSender {
	return &StubSender{logger: logger}
}

// Send records the email and logs it.
func (s *StubSender) Send(to, subject, body string) error {
	s.logger.Info("[STUB EMAIL]",
		zap.String("to", to),
		zap.String("subject", subject),
		zap.Int("bodyLen", len(body)),
	)
	s.Sent = append(s.Sent, SentEmail{To: to, Subject: subject, Body: body})
	return nil
}

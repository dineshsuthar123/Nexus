package email

import (
	"bytes"
	"fmt"
	"html/template"
	"net/smtp"
	"strings"

	"go.uber.org/zap"
)

// Sender defines the interface for sending emails.
type Sender interface {
	SendVerificationEmail(toEmail, token string) error
	SendPasswordResetEmail(toEmail, token string) error
}

// SMTPConfig holds SMTP connection settings.
type SMTPConfig struct {
	Host        string
	Port        int
	Username    string
	Password    string
	FromAddress string
	FromName    string
	BaseURL     string // Frontend base URL for links, e.g. "https://app.nexusrtp.com"
}

// SMTPSender sends emails via SMTP.
type SMTPSender struct {
	cfg    SMTPConfig
	logger *zap.Logger
}

// NewSMTPSender creates a new SMTP-based email sender.
func NewSMTPSender(cfg SMTPConfig, logger *zap.Logger) *SMTPSender {
	return &SMTPSender{cfg: cfg, logger: logger}
}

// SendVerificationEmail sends an email verification link to the user.
func (s *SMTPSender) SendVerificationEmail(toEmail, token string) error {
	link := fmt.Sprintf("%s/verify-email?token=%s", s.cfg.BaseURL, token)

	data := map[string]string{
		"VerificationLink": link,
	}

	body, err := renderTemplate(verificationEmailTemplate, data)
	if err != nil {
		return fmt.Errorf("failed to render verification email: %w", err)
	}

	subject := "Verify your Nexus RTP account"
	if err := s.send(toEmail, subject, body); err != nil {
		s.logger.Error("Failed to send verification email",
			zap.String("to", toEmail),
			zap.Error(err),
		)
		return fmt.Errorf("failed to send verification email: %w", err)
	}

	s.logger.Info("Verification email sent", zap.String("to", toEmail))
	return nil
}

// SendPasswordResetEmail sends a password reset link to the user.
func (s *SMTPSender) SendPasswordResetEmail(toEmail, token string) error {
	link := fmt.Sprintf("%s/reset-password?token=%s", s.cfg.BaseURL, token)

	data := map[string]string{
		"ResetLink": link,
	}

	body, err := renderTemplate(passwordResetEmailTemplate, data)
	if err != nil {
		return fmt.Errorf("failed to render password reset email: %w", err)
	}

	subject := "Reset your Nexus RTP password"
	if err := s.send(toEmail, subject, body); err != nil {
		s.logger.Error("Failed to send password reset email",
			zap.String("to", toEmail),
			zap.Error(err),
		)
		return fmt.Errorf("failed to send password reset email: %w", err)
	}

	s.logger.Info("Password reset email sent", zap.String("to", toEmail))
	return nil
}

// send dispatches an email via SMTP.
func (s *SMTPSender) send(to, subject, htmlBody string) error {
	from := s.cfg.FromAddress
	addr := fmt.Sprintf("%s:%d", s.cfg.Host, s.cfg.Port)

	headers := map[string]string{
		"From":         fmt.Sprintf("%s <%s>", s.cfg.FromName, from),
		"To":           to,
		"Subject":      subject,
		"MIME-Version": "1.0",
		"Content-Type": "text/html; charset=\"UTF-8\"",
	}

	var msg strings.Builder
	for k, v := range headers {
		msg.WriteString(fmt.Sprintf("%s: %s\r\n", k, v))
	}
	msg.WriteString("\r\n")
	msg.WriteString(htmlBody)

	var auth smtp.Auth
	if s.cfg.Username != "" {
		auth = smtp.PlainAuth("", s.cfg.Username, s.cfg.Password, s.cfg.Host)
	}

	return smtp.SendMail(addr, auth, from, []string{to}, []byte(msg.String()))
}

func renderTemplate(tmpl string, data interface{}) (string, error) {
	t, err := template.New("email").Parse(tmpl)
	if err != nil {
		return "", err
	}
	var buf bytes.Buffer
	if err := t.Execute(&buf, data); err != nil {
		return "", err
	}
	return buf.String(), nil
}

// NoopSender is a no-op email sender for development/testing.
// It logs emails instead of sending them.
type NoopSender struct {
	logger *zap.Logger
}

// NewNoopSender creates a no-op email sender that only logs.
func NewNoopSender(logger *zap.Logger) *NoopSender {
	return &NoopSender{logger: logger}
}

func (n *NoopSender) SendVerificationEmail(toEmail, token string) error {
	n.logger.Info("[DEV] Verification email (not sent)",
		zap.String("to", toEmail),
		zap.String("token", token),
	)
	return nil
}

func (n *NoopSender) SendPasswordResetEmail(toEmail, token string) error {
	n.logger.Info("[DEV] Password reset email (not sent)",
		zap.String("to", toEmail),
		zap.String("token", token),
	)
	return nil
}

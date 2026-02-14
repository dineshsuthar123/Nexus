package auth

import (
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

// TokenPair contains access and refresh tokens.
type TokenPair struct {
	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken"`
	ExpiresIn    int64  `json:"expiresIn"`
	TokenType    string `json:"tokenType"`
}

// Claims represents JWT claims.
type Claims struct {
	jwt.RegisteredClaims
	UID   string   `json:"uid"`
	Email string   `json:"email"`
	Roles []string `json:"roles"`
}

// TokenService manages JWT token creation and validation.
type TokenService struct {
	privateKey         *rsa.PrivateKey
	publicKey          *rsa.PublicKey
	accessTokenExpiry  time.Duration
	refreshTokenExpiry time.Duration
	issuer             string
}

// NewTokenService creates a TokenService from PEM key files.
func NewTokenService(privateKeyPath, publicKeyPath string, accessExpiry, refreshExpiry time.Duration, issuer string) (*TokenService, error) {
	privKey, err := loadPrivateKey(privateKeyPath)
	if err != nil {
		return nil, fmt.Errorf("failed to load private key: %w", err)
	}

	pubKey, err := loadPublicKey(publicKeyPath)
	if err != nil {
		return nil, fmt.Errorf("failed to load public key: %w", err)
	}

	return &TokenService{
		privateKey:         privKey,
		publicKey:          pubKey,
		accessTokenExpiry:  accessExpiry,
		refreshTokenExpiry: refreshExpiry,
		issuer:             issuer,
	}, nil
}

// GenerateTokenPair creates a new access/refresh token pair.
func (s *TokenService) GenerateTokenPair(userID uuid.UUID, email string, roles []string) (*TokenPair, error) {
	now := time.Now().UTC()
	jti := uuid.New().String()

	accessClaims := Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   userID.String(),
			Issuer:    s.issuer,
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(s.accessTokenExpiry)),
			ID:        jti,
		},
		UID:   userID.String(),
		Email: email,
		Roles: roles,
	}

	accessToken := jwt.NewWithClaims(jwt.SigningMethodRS256, accessClaims)
	accessTokenStr, err := accessToken.SignedString(s.privateKey)
	if err != nil {
		return nil, fmt.Errorf("failed to sign access token: %w", err)
	}

	refreshTokenStr := uuid.New().String()

	return &TokenPair{
		AccessToken:  accessTokenStr,
		RefreshToken: refreshTokenStr,
		ExpiresIn:    int64(s.accessTokenExpiry.Seconds()),
		TokenType:    "Bearer",
	}, nil
}

// ValidateAccessToken parses and validates an access token.
func (s *TokenService) ValidateAccessToken(tokenStr string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return s.publicKey, nil
	})

	if err != nil {
		return nil, fmt.Errorf("failed to parse token: %w", err)
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("invalid token claims")
	}

	return claims, nil
}

// GetRefreshTokenExpiry returns the refresh token TTL.
func (s *TokenService) GetRefreshTokenExpiry() time.Duration {
	return s.refreshTokenExpiry
}

// GetPublicKey returns the RSA public key (for Kong JWT plugin or JWKS endpoint).
func (s *TokenService) GetPublicKey() *rsa.PublicKey {
	return s.publicKey
}

// --- Key Loading Helpers ---

func loadPrivateKey(path string) (*rsa.PrivateKey, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read private key file: %w", err)
	}

	block, _ := pem.Decode(data)
	if block == nil {
		return nil, fmt.Errorf("failed to decode PEM block")
	}

	// Try PKCS#8 first, then PKCS#1
	key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		key2, err2 := x509.ParsePKCS1PrivateKey(block.Bytes)
		if err2 != nil {
			return nil, fmt.Errorf("failed to parse private key (PKCS8: %v, PKCS1: %v)", err, err2)
		}
		return key2, nil
	}

	rsaKey, ok := key.(*rsa.PrivateKey)
	if !ok {
		return nil, fmt.Errorf("private key is not RSA")
	}
	return rsaKey, nil
}

func loadPublicKey(path string) (*rsa.PublicKey, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read public key file: %w", err)
	}

	block, _ := pem.Decode(data)
	if block == nil {
		return nil, fmt.Errorf("failed to decode PEM block")
	}

	// Try PKIX first (standard), then PKCS#1
	key, err := x509.ParsePKIXPublicKey(block.Bytes)
	if err != nil {
		key2, err2 := x509.ParsePKCS1PublicKey(block.Bytes)
		if err2 != nil {
			return nil, fmt.Errorf("failed to parse public key (PKIX: %v, PKCS1: %v)", err, err2)
		}
		return key2, nil
	}

	rsaKey, ok := key.(*rsa.PublicKey)
	if !ok {
		return nil, fmt.Errorf("public key is not RSA")
	}
	return rsaKey, nil
}

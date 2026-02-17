//go:build ignore
// +build ignore

package main

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/pem"
	"fmt"
	"os"
)

func main() {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to generate key: %v\n", err)
		os.Exit(1)
	}

	privBytes, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to marshal private key: %v\n", err)
		os.Exit(1)
	}

	privFile, err := os.Create("keys/dev_private.pem")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to create private key file: %v\n", err)
		os.Exit(1)
	}
	defer privFile.Close()

	if err := pem.Encode(privFile, &pem.Block{Type: "PRIVATE KEY", Bytes: privBytes}); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to write private key: %v\n", err)
		os.Exit(1)
	}

	pubBytes, err := x509.MarshalPKIXPublicKey(&key.PublicKey)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to marshal public key: %v\n", err)
		os.Exit(1)
	}

	pubFile, err := os.Create("keys/dev_public.pem")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to create public key file: %v\n", err)
		os.Exit(1)
	}
	defer pubFile.Close()

	if err := pem.Encode(pubFile, &pem.Block{Type: "PUBLIC KEY", Bytes: pubBytes}); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to write public key: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("Dev RSA keys generated in keys/ directory")
}

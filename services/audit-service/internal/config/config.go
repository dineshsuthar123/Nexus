package config

import "github.com/spf13/viper"

type Config struct {
	Port        string
	DatabaseURL string
	LogLevel    string
}

func Load() *Config {
	viper.SetDefault("PORT", "8080")
	viper.SetDefault("DATABASE_URL", "postgresql://root@cockroachdb-1:26257/nexus_ledger?sslmode=disable")
	viper.SetDefault("LOG_LEVEL", "info")
	viper.AutomaticEnv()

	return &Config{
		Port:        viper.GetString("PORT"),
		DatabaseURL: viper.GetString("DATABASE_URL"),
		LogLevel:    viper.GetString("LOG_LEVEL"),
	}
}

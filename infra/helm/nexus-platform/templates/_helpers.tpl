{{/*
Expand the name of the chart.
*/}}
{{- define "nexus-platform.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "nexus-platform.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "nexus-platform.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "nexus-platform.labels" -}}
helm.sh/chart: {{ include "nexus-platform.chart" . }}
{{ include "nexus-platform.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "nexus-platform.selectorLabels" -}}
app.kubernetes.io/name: {{ include "nexus-platform.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Payment Service name
*/}}
{{- define "nexus-platform.paymentService.fullname" -}}
{{- printf "%s-payment-service" (include "nexus-platform.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Account Service name
*/}}
{{- define "nexus-platform.accountService.fullname" -}}
{{- printf "%s-account-service" (include "nexus-platform.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Reconciliation Service name
*/}}
{{- define "nexus-platform.reconciliationService.fullname" -}}
{{- printf "%s-reconciliation-service" (include "nexus-platform.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Frontend name
*/}}
{{- define "nexus-platform.frontend.fullname" -}}
{{- printf "%s-frontend" (include "nexus-platform.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Auth Service name
*/}}
{{- define "nexus-platform.authService.fullname" -}}
{{- printf "%s-auth-service" (include "nexus-platform.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
WS Gateway name
*/}}
{{- define "nexus-platform.wsGateway.fullname" -}}
{{- printf "%s-ws-gateway" (include "nexus-platform.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Notification Service name
*/}}
{{- define "nexus-platform.notificationService.fullname" -}}
{{- printf "%s-notification-service" (include "nexus-platform.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Analytics Service name
*/}}
{{- define "nexus-platform.analyticsService.fullname" -}}
{{- printf "%s-analytics-service" (include "nexus-platform.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Audit Service name
*/}}
{{- define "nexus-platform.auditService.fullname" -}}
{{- printf "%s-audit-service" (include "nexus-platform.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Database URL
*/}}
{{- define "nexus-platform.databaseUrl" -}}
{{- if .Values.cockroachdb.enabled }}
postgres://root@{{ .Release.Name }}-cockroachdb:26257/nexus?sslmode=verify-full
{{- else }}
{{ .Values.externalDatabase.url }}
{{- end }}
{{- end }}

{{/*
Kafka brokers
*/}}
{{- define "nexus-platform.kafkaBrokers" -}}
{{- if .Values.kafka.enabled }}
{{ .Release.Name }}-kafka:9092
{{- else }}
{{ .Values.externalKafka.brokers }}
{{- end }}
{{- end }}

{{/*
Redis URL
*/}}
{{- define "nexus-platform.redisUrl" -}}
{{- if .Values.redis.enabled }}
{{ .Release.Name }}-redis-master:6379
{{- else }}
{{ .Values.externalRedis.url }}
{{- end }}
{{- end }}

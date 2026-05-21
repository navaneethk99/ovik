FROM golang:1.24-bookworm AS builder

WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY pkg ./pkg
COPY apps/backend ./apps/backend

RUN CGO_ENABLED=0 GOOS=linux go build -o /out/backend ./apps/backend

FROM gcr.io/distroless/static-debian12

WORKDIR /app

COPY --from=builder /out/backend /app/backend

EXPOSE 8080

ENTRYPOINT ["/app/backend"]

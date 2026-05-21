FROM golang:1.26-bookworm

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
	build-essential \
	cmake \
	clang \
	pkg-config \
	libjpeg-dev \
	libopenblas-dev \
	liblapack-dev \
	libopencv-dev \
	libdlib-dev \
	libgtk2.0-dev \
	libavcodec-dev \
	libavformat-dev \
	libswscale-dev \
	libv4l-dev \
	v4l-utils \
	ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

COPY go.mod go.sum ./
RUN go mod download

COPY pkg ./pkg
COPY apps/recognizer ./apps/recognizer

WORKDIR /app/apps/recognizer

RUN go build -o /usr/local/bin/recognizer .

ENTRYPOINT ["/usr/local/bin/recognizer"]

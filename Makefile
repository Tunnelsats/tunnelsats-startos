PKG_ID := tunnelsats
PKG_VERSION := $(shell yq '.version' manifest.yaml)
PLATFORM ?= $(shell uname -m)

# Detect architecture
ifeq ($(PLATFORM),x86_64)
	ARCH := amd64
	DOCKER_PLATFORM := linux/amd64
else ifeq ($(PLATFORM),aarch64)
	ARCH := arm64
	DOCKER_PLATFORM := linux/arm64
else
	$(error Unsupported platform: $(PLATFORM))
endif

.PHONY: all build pack clean test test-docker install

all: pack

# Build Docker image
build:
	mkdir -p docker-images
	docker buildx build \
		--tag start9/$(PKG_ID)/main:$(PKG_VERSION) \
		--platform $(DOCKER_PLATFORM) \
		-o type=docker,dest=docker-images/$(ARCH).tar \
		.

# Package for StartOS
pack: build
	start-sdk pack
	start-sdk verify s9pk $(PKG_ID).s9pk
	mv $(PKG_ID).s9pk $(PKG_ID)_$(ARCH).s9pk

# Setup build environment
prepare:
	./prepare.sh

# Run unit tests
test:
	@echo "Running unit tests..."
	bats tests/

# Docker smoke test
test-docker:
	@echo "Testing Docker build..."
	docker build -t $(PKG_ID)-test .
	docker run --rm --cap-add=NET_ADMIN $(PKG_ID)-test echo "Container starts OK"
	@echo "Docker smoke test passed"

# Clean build artifacts
clean:
	rm -f *.s9pk
	rm -f image.tar
	rm -rf docker-images/

# Install to StartOS (requires start-cli configured)
install: pack
	start-cli package install $(PKG_ID).s9pk

# Development helpers
lint:
	shellcheck scripts/*.sh

fmt:
	shfmt -i 2 -w scripts/*.sh

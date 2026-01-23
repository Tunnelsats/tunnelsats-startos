# Contributing to TunnelSats for StartOS

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Getting Started

1. Fork the repository
2. Clone your fork locally
3. Set up your development environment (see README.md)

## Development Workflow

### Branching
- `main` - stable releases
- `develop` - integration branch for features
- `feature/*` - new features
- `fix/*` - bug fixes

### Commit Messages
Use conventional commits:
```
feat: add multi-region support
fix: resolve DNS leak in health check
docs: update LND configuration example
test: add integration tests for config parser
```

### Pull Requests
1. Create a feature branch from `develop`
2. Make your changes
3. Run tests: `make test`
4. Push and create a PR against `develop`
5. Await review

## Testing

Before submitting a PR, ensure:
```bash
# Unit tests pass
make test

# Docker build succeeds
make build

# Package builds
make pack
```

## Code Style

- Shell scripts: Follow [Google Shell Style Guide](https://google.github.io/styleguide/shellguide.html)
- Use shellcheck for linting

## Questions?

- Open an issue for bugs or feature requests
- Join our [Telegram](https://t.me/tunnelsats) for discussion

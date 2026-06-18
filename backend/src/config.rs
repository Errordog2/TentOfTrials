use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::path::Path;
use thiserror::Error;

const DEFAULT_BACKEND_HOST: &str = "0.0.0.0";
const DEFAULT_BACKEND_PORT: u16 = 8080;
const DEFAULT_LOG_LEVEL: &str = "info";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Config {
    pub host: String,
    pub port: u16,
    pub log_level: String,
    pub enable_experimental: bool,
}

#[derive(Debug, Error, PartialEq, Eq)]
pub enum ConfigError {
    #[error("{name} must be a valid TCP port from 1 to 65535, got {value:?}")]
    InvalidPort { name: &'static str, value: String },
    #[error("{name} must be a boolean value (true/false, 1/0, yes/no, on/off), got {value:?}")]
    InvalidBoolean { name: &'static str, value: String },
}

impl Config {
    pub fn from_env() -> std::result::Result<Self, ConfigError> {
        Self::from_lookup(|name| std::env::var(name).ok())
    }

    fn from_lookup<F>(lookup: F) -> std::result::Result<Self, ConfigError>
    where
        F: Fn(&str) -> Option<String>,
    {
        let host = lookup("TOT_BACKEND_HOST")
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| DEFAULT_BACKEND_HOST.to_string());
        let port = parse_port(
            "TOT_BACKEND_PORT",
            lookup("TOT_BACKEND_PORT"),
            DEFAULT_BACKEND_PORT,
        )?;
        let log_level = lookup("TOT_LOG_LEVEL")
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| DEFAULT_LOG_LEVEL.to_string());
        let enable_experimental = parse_bool(
            "TOT_ENABLE_EXPERIMENTAL",
            lookup("TOT_ENABLE_EXPERIMENTAL"),
            false,
        )?;

        Ok(Self {
            host,
            port,
            log_level,
            enable_experimental,
        })
    }
}

fn parse_port(
    name: &'static str,
    value: Option<String>,
    default: u16,
) -> std::result::Result<u16, ConfigError> {
    let Some(value) = value else {
        return Ok(default);
    };

    let trimmed = value.trim();
    match trimmed.parse::<u16>() {
        Ok(port) if port > 0 => Ok(port),
        _ => Err(ConfigError::InvalidPort { name, value }),
    }
}

fn parse_bool(
    name: &'static str,
    value: Option<String>,
    default: bool,
) -> std::result::Result<bool, ConfigError> {
    let Some(value) = value else {
        return Ok(default);
    };

    match value.trim().to_ascii_lowercase().as_str() {
        "true" | "1" | "yes" | "on" => Ok(true),
        "false" | "0" | "no" | "off" => Ok(false),
        _ => Err(ConfigError::InvalidBoolean { name, value }),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceConfig {
    pub name: String,
    pub version: String,
    pub host: String,
    pub port: u16,
    pub tls_enabled: bool,
    pub tls_cert_path: Option<String>,
    pub tls_key_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegistryConfig {
    pub backend: String,
    pub endpoints: Vec<String>,
    pub heartbeat_interval_ms: u64,
    pub ttl_seconds: u64,
    pub replication_factor: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveryConfig {
    pub provider: String,
    pub namespace: String,
    pub tags: Vec<String>,
    pub health_check_path: String,
    pub health_check_interval_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessagingConfig {
    pub broker_type: String,
    pub uris: Vec<String>,
    pub consumer_group: String,
    pub max_retries: u32,
    pub retry_backoff_ms: u64,
    pub batch_size: u32,
    pub compression: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RootConfig {
    pub service: ServiceConfig,
    pub registry: RegistryConfig,
    pub discovery: DiscoveryConfig,
    pub messaging: MessagingConfig,
}

impl Default for RootConfig {
    fn default() -> Self {
        Self {
            service: ServiceConfig {
                name: "tent-backend".into(),
                version: "0.1.0".into(),
                host: DEFAULT_BACKEND_HOST.into(),
                port: DEFAULT_BACKEND_PORT,
                tls_enabled: false,
                tls_cert_path: None,
                tls_key_path: None,
            },
            registry: RegistryConfig {
                backend: "etcd".into(),
                endpoints: vec!["localhost:2379".into()],
                heartbeat_interval_ms: 5000,
                ttl_seconds: 30,
                replication_factor: 3,
            },
            discovery: DiscoveryConfig {
                provider: "consul".into(),
                namespace: "tent".into(),
                tags: vec!["microservice".into(), "orchestration".into()],
                health_check_path: "/health".into(),
                health_check_interval_ms: 10000,
            },
            messaging: MessagingConfig {
                broker_type: "kafka".into(),
                uris: vec!["localhost:9092".into()],
                consumer_group: "tent-consumers".into(),
                max_retries: 3,
                retry_backoff_ms: 1000,
                batch_size: 500,
                compression: "snappy".into(),
            },
        }
    }
}

pub async fn load_config(path: &str) -> Result<RootConfig> {
    let path = Path::new(path);
    if path.exists() {
        let contents = tokio::fs::read_to_string(path).await?;
        let config: RootConfig = toml::from_str(&contents)?;
        tracing::info!("configuration loaded from {}", path.display());
        Ok(config)
    } else {
        tracing::warn!("config file {} not found, using defaults", path.display());
        Ok(RootConfig::default())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn config_from(vars: &[(&str, &str)]) -> std::result::Result<Config, ConfigError> {
        let vars: HashMap<String, String> = vars
            .iter()
            .map(|(key, value)| ((*key).to_string(), (*value).to_string()))
            .collect();
        Config::from_lookup(|name| vars.get(name).cloned())
    }

    #[test]
    fn uses_safe_defaults_when_env_is_missing() {
        assert_eq!(
            config_from(&[]).unwrap(),
            Config {
                host: "0.0.0.0".into(),
                port: 8080,
                log_level: "info".into(),
                enable_experimental: false,
            }
        );
    }

    #[test]
    fn reads_valid_environment_overrides() {
        assert_eq!(
            config_from(&[
                ("TOT_BACKEND_HOST", "127.0.0.1"),
                ("TOT_BACKEND_PORT", "9090"),
                ("TOT_LOG_LEVEL", "debug,tent_backend=trace"),
                ("TOT_ENABLE_EXPERIMENTAL", "yes"),
            ])
            .unwrap(),
            Config {
                host: "127.0.0.1".into(),
                port: 9090,
                log_level: "debug,tent_backend=trace".into(),
                enable_experimental: true,
            }
        );
    }

    #[test]
    fn rejects_invalid_ports() {
        assert_eq!(
            config_from(&[("TOT_BACKEND_PORT", "70000")]).unwrap_err(),
            ConfigError::InvalidPort {
                name: "TOT_BACKEND_PORT",
                value: "70000".into(),
            }
        );
        assert_eq!(
            config_from(&[("TOT_BACKEND_PORT", "0")]).unwrap_err(),
            ConfigError::InvalidPort {
                name: "TOT_BACKEND_PORT",
                value: "0".into(),
            }
        );
    }

    #[test]
    fn rejects_invalid_boolean_values() {
        assert_eq!(
            config_from(&[("TOT_ENABLE_EXPERIMENTAL", "sometimes")]).unwrap_err(),
            ConfigError::InvalidBoolean {
                name: "TOT_ENABLE_EXPERIMENTAL",
                value: "sometimes".into(),
            }
        );
    }
}

mod scan;

use std::fs;
use std::path::PathBuf;
use tauri::Manager;

/// Store a secret (API key) in app data dir with restricted permissions
#[tauri::command]
fn store_secret(app: tauri::AppHandle, key: String, value: String) -> Result<(), String> {
    let data_dir = app.path().app_data_dir()
        .map_err(|e| format!("No app data dir: {}", e))?;
    fs::create_dir_all(&data_dir).map_err(|e| format!("mkdir failed: {}", e))?;

    let secrets_path = data_dir.join("secrets.json");
    let mut secrets: serde_json::Map<String, serde_json::Value> = if secrets_path.exists() {
        let raw = fs::read_to_string(&secrets_path).unwrap_or_default();
        serde_json::from_str(&raw).unwrap_or_default()
    } else {
        serde_json::Map::new()
    };

    secrets.insert(key, serde_json::Value::String(value));
    let json = serde_json::to_string_pretty(&serde_json::Value::Object(secrets))
        .map_err(|e| format!("JSON error: {}", e))?;
    fs::write(&secrets_path, &json).map_err(|e| format!("write failed: {}", e))?;

    // Restrict permissions on Unix
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o600);
        let _ = std::fs::set_permissions(&secrets_path, perms);
    }

    Ok(())
}

/// Read a secret from app data dir
#[tauri::command]
fn read_secret(app: tauri::AppHandle, key: String) -> Result<String, String> {
    let data_dir = app.path().app_data_dir()
        .map_err(|e| format!("No app data dir: {}", e))?;
    let secrets_path = data_dir.join("secrets.json");
    if !secrets_path.exists() { return Ok(String::new()); }

    let raw = fs::read_to_string(&secrets_path)
        .map_err(|e| format!("read failed: {}", e))?;
    let secrets: serde_json::Map<String, serde_json::Value> =
        serde_json::from_str(&raw).unwrap_or_default();

    Ok(secrets.get(&key)
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string())
}

/// Check if a file exists (scoped — only used for deploy path checks)
#[tauri::command]
fn file_exists(path: String) -> bool {
    PathBuf::from(&path).exists()
}

/// Deploy profile to a specific file path (smart merge with meport marker)
/// SCOPED: only allows known meport-related filenames
#[tauri::command]
fn deploy_to_file(path: String, content: String) -> Result<String, String> {
    let allowed_filenames = [
        "CLAUDE.md", "meport.mdc", ".cursorrules", ".windsurfrules",
        "copilot-instructions.md", "AGENTS.md", "Modelfile",
        "meport-rules.md", "meport-profile.json",
    ];
    let path_buf = PathBuf::from(&path);
    let filename = path_buf.file_name()
        .map(|f| f.to_string_lossy().to_string())
        .unwrap_or_default();
    if !allowed_filenames.iter().any(|&a| a == filename) {
        return Err(format!("Deploy blocked: '{}' is not an allowed meport filename", filename));
    }

    let marker = "# --- meport profile (auto-generated) ---";

    if let Some(parent) = path_buf.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("mkdir failed: {}", e))?;
    }

    if path_buf.exists() {
        let existing = fs::read_to_string(&path).unwrap_or_default();
        if existing.contains(marker) {
            // Replace meport section
            let before = existing.split(marker).next().unwrap_or("").trim_end();
            let merged = format!("{}\n\n{}\n\n{}", before, marker, content);
            fs::write(&path, &merged).map_err(|e| format!("write failed: {}", e))?;
            return Ok("updated".to_string());
        } else if !existing.is_empty() {
            // Append meport section
            let merged = format!("{}\n\n{}\n\n{}", existing.trim_end(), marker, content);
            fs::write(&path, &merged).map_err(|e| format!("write failed: {}", e))?;
            return Ok("merged".to_string());
        }
    }

    // New file
    fs::write(&path, &content).map_err(|e| format!("write failed: {}", e))?;
    Ok("new".to_string())
}

/// Discover AI config files in a directory (recursive, max depth 3)
#[tauri::command]
fn discover_ai_configs(base_dir: String) -> Vec<DiscoveredFile> {
    let known_files = vec![
        "CLAUDE.md",
        ".cursorrules",
        ".windsurfrules",
        "AGENTS.md",
        "Modelfile",
    ];
    let known_dirs = vec![
        ".cursor/rules",
        ".github",
    ];
    let known_in_dirs = vec![
        ("copilot-instructions.md", ".github"),
    ];

    let mut found = Vec::new();
    walk_for_configs(&PathBuf::from(&base_dir), &known_files, &known_dirs, &known_in_dirs, &mut found, 0, 3);
    found
}

#[derive(serde::Serialize)]
struct DiscoveredFile {
    path: String,
    filename: String,
    platform: String,
    size: u64,
}

fn walk_for_configs(
    dir: &PathBuf,
    known_files: &[&str],
    _known_dirs: &[&str],
    _known_in_dirs: &[(&str, &str)],
    found: &mut Vec<DiscoveredFile>,
    depth: usize,
    max_depth: usize,
) {
    if depth > max_depth { return; }

    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden dirs (except .cursor, .github)
        if name.starts_with('.') && name != ".cursor" && name != ".github" && path.is_dir() {
            continue;
        }

        if path.is_file() {
            let platform = match name.as_str() {
                "CLAUDE.md" => "Claude Code",
                ".cursorrules" => "Cursor",
                ".windsurfrules" => "Windsurf",
                "AGENTS.md" => "AGENTS.md",
                "Modelfile" => "Ollama",
                "copilot-instructions.md" => "Copilot",
                _ if name.ends_with(".mdc") && path.to_string_lossy().contains(".cursor/rules") => "Cursor",
                _ => continue,
            };

            let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
            found.push(DiscoveredFile {
                path: path.to_string_lossy().to_string(),
                filename: name,
                platform: platform.to_string(),
                size,
            });
        } else if path.is_dir() {
            walk_for_configs(&path, known_files, _known_dirs, _known_in_dirs, found, depth + 1, max_depth);
        }
    }
}

/// Get home directory
#[tauri::command]
fn get_home_dir() -> Result<String, String> {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "Cannot determine home directory".to_string())
}

/// Get current working directory
#[tauri::command]
fn get_cwd() -> Result<String, String> {
    std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .map_err(|e| format!("Cannot get cwd: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            store_secret,
            read_secret,
            file_exists,
            deploy_to_file,
            discover_ai_configs,
            get_home_dir,
            get_cwd,
            scan::scan_system,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

//! System scanner for AI profiling.
//!
//! Mirrors the CLI `profile-ai.ts` scanning logic.
//! Scans file/folder NAMES, app names, bookmarks, shell history, etc.
//! Never reads file content except for writing samples (.md/.txt, first 500 chars).
//! Privacy patterns filter sensitive data automatically.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::process::Command;

/// Privacy filter — same patterns as CLI PRIVACY_PATTERNS
fn is_sensitive(name: &str) -> bool {
    let lower = name.to_lowercase();
    let patterns = [
        "password", "credential", "secret", "private", "token", ".env", ".ssh", ".aws",
        ".gnupg", ".pgp", "medical", "legal", "divorce", "tax", "bank", "credit",
        "payroll", "salary", "nda", "confidential", "classified", "hipaa", "ssn",
        "passport", "driver", "social_security", "therapy", "prescription", "insurance",
        "keychain", ".pem", ".key", "doctor", "hospital", "diagnos", "psychiatr",
        "psycholog", "rehab", "addiction", "narcotics", "tinder", "bumble", "hinge",
        "grindr", "onlyfans", "porn", "xxx", "adult", "dating", "escort", "payslip",
        "tax_return", "kredyt", "pożyczka", "invoice", "lawyer", "court", "lawsuit",
        "custody", "id_rsa", "private_key", ".p12", ".pfx", "pesel", "birth_cert",
        "substance", "testament",
    ];
    patterns.iter().any(|p| lower.contains(p))
}

fn filter_sensitive(items: Vec<String>) -> Vec<String> {
    items.into_iter().filter(|s| !is_sensitive(s)).collect()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanResult {
    /// Results per category
    pub categories: HashMap<String, Vec<String>>,
    /// Total items found (before privacy filter)
    pub total_scanned: usize,
    /// Items removed by privacy filter
    pub privacy_filtered: usize,
    /// OS username from home directory (e.g. "username" from /Users/username)
    pub username: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ScanRequest {
    pub areas: Vec<String>,
}

/// Main scan command — called from frontend
#[tauri::command]
pub fn scan_system(request: ScanRequest) -> Result<ScanResult, String> {
    let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
    let areas: std::collections::HashSet<String> = request.areas.into_iter().collect();

    let mut categories: HashMap<String, Vec<String>> = HashMap::new();
    let mut total_scanned: usize = 0;
    let mut privacy_filtered: usize = 0;

    // ── Folders: Desktop, Documents, Downloads ──
    if areas.contains("folders") {
        let dirs_to_scan = [
            ("Desktop", home.join("Desktop")),
            ("Documents", home.join("Documents")),
            ("Downloads", home.join("Downloads")),
        ];

        for (label, dir_path) in &dirs_to_scan {
            if let Ok(entries) = scan_folder_recursive(dir_path, 2) {
                total_scanned += entries.len();
                let before = entries.len();
                let filtered = filter_sensitive(entries);
                privacy_filtered += before - filtered.len();
                if !filtered.is_empty() {
                    categories.insert(label.to_string(), filtered);
                }
            }
        }

        // Git repositories in Desktop/Documents
        let git_repos = find_git_repos(&home);
        if !git_repos.is_empty() {
            categories.insert("Git repositories".to_string(), git_repos);
        }

        // Project detection
        let projects = detect_projects(&home);
        if !projects.is_empty() {
            categories.insert("Projects".to_string(), projects);
        }

        // Recently modified files (macOS mdfind)
        if cfg!(target_os = "macos") {
            if let Some(recent) = scan_recent_files(&home) {
                categories.insert("Recently modified (7d)".to_string(), recent);
            }
        }
    }

    // ── Apps: installed, Dock, auto-start ──
    if areas.contains("apps") {
        // /Applications
        if let Ok(entries) = fs::read_dir("/Applications") {
            let apps: Vec<String> = entries
                .filter_map(|e| e.ok())
                .map(|e| e.file_name().to_string_lossy().to_string())
                .filter(|n| n.ends_with(".app"))
                .map(|n| n.trim_end_matches(".app").to_string())
                .collect();
            total_scanned += apps.len();
            let before = apps.len();
            let filtered = filter_sensitive(apps);
            privacy_filtered += before - filtered.len();
            if !filtered.is_empty() {
                categories.insert("Apps (installed)".to_string(), filtered);
            }
        }

        // Dock pinned apps
        if let Some(dock) = scan_dock_apps() {
            categories.insert("Apps (Dock)".to_string(), dock);
        }

        // Login items
        if let Some(login) = scan_login_items() {
            categories.insert("Apps (auto-start)".to_string(), login);
        }

        // Recently used apps
        if cfg!(target_os = "macos") {
            if let Some(recent) = scan_recent_apps() {
                categories.insert("Apps (recent 14d)".to_string(), recent);
            }
        }
    }

    // ── Browser: bookmarks ──
    if areas.contains("browser") {
        // Chrome bookmarks
        let chrome_path = home
            .join("Library/Application Support/Google/Chrome/Default/Bookmarks");
        if let Some(bookmarks) = parse_chrome_bookmarks(&chrome_path) {
            categories.insert("Bookmarks (Chrome)".to_string(), bookmarks);
        }

        // Edge bookmarks
        let edge_path = home
            .join("Library/Application Support/Microsoft Edge/Default/Bookmarks");
        if let Some(bookmarks) = parse_chrome_bookmarks(&edge_path) {
            categories.insert("Bookmarks (Edge)".to_string(), bookmarks);
        }

        // Safari bookmarks (macOS)
        if cfg!(target_os = "macos") {
            if let Some(bookmarks) = scan_safari_bookmarks(&home) {
                if !categories.contains_key("Bookmarks (Chrome)")
                    && !categories.contains_key("Bookmarks (Edge)")
                {
                    categories.insert("Bookmarks (Safari)".to_string(), bookmarks);
                }
            }
        }
    }

    // ── Dev tools: brew, npm, pip, VS Code, Docker ──
    if areas.contains("devtools") {
        // Homebrew
        if let Some(brew) = run_cmd("brew", &["list", "--formula"]) {
            let pkgs: Vec<String> = brew.lines().map(|s| s.to_string()).collect();
            let filtered = filter_sensitive(pkgs);
            if !filtered.is_empty() {
                categories.insert("Homebrew (CLI)".to_string(), filtered);
            }
        }
        if let Some(cask) = run_cmd("brew", &["list", "--cask"]) {
            let pkgs: Vec<String> = cask.lines().map(|s| s.to_string()).collect();
            let filtered = filter_sensitive(pkgs);
            if !filtered.is_empty() {
                categories.insert("Homebrew (GUI)".to_string(), filtered);
            }
        }

        // npm globals
        if let Some(npm) = run_cmd("npm", &["list", "-g", "--depth=0"]) {
            let pkgs: Vec<String> = npm
                .lines()
                .filter_map(|l| {
                    // Parse "├── package@version"
                    let trimmed = l.trim_start_matches(|c: char| !c.is_alphanumeric());
                    trimmed.split('@').next().map(|s| s.to_string())
                })
                .filter(|s| !s.is_empty() && !s.contains("npm") && !s.starts_with('/'))
                .collect();
            let filtered = filter_sensitive(pkgs);
            if !filtered.is_empty() {
                categories.insert("npm (global)".to_string(), filtered);
            }
        }

        // pip packages
        if let Some(pip) = run_cmd("pip3", &["list", "--format=freeze"]) {
            let pkgs: Vec<String> = pip
                .lines()
                .take(40)
                .filter_map(|l| l.split("==").next().map(|s| s.to_string()))
                .filter(|s| !s.starts_with("pip") && !s.starts_with("setup"))
                .collect();
            if pkgs.len() > 5 {
                categories.insert("Python packages".to_string(), pkgs);
            }
        }

        // VS Code / Cursor extensions
        for (editor, cmd) in [("VS Code", "code"), ("Cursor", "cursor")] {
            if let Some(exts) = run_cmd(cmd, &["--list-extensions"]) {
                let list: Vec<String> = exts.lines().map(|s| s.to_string()).filter(|s| !s.is_empty()).collect();
                let filtered = filter_sensitive(list);
                if !filtered.is_empty() {
                    categories.insert(format!("{} extensions", editor), filtered);
                }
            }
        }

        // Docker images
        if let Some(docker) = run_cmd("docker", &["images", "--format", "{{.Repository}}:{{.Tag}}"]) {
            let images: Vec<String> = docker
                .lines()
                .filter(|l| !l.starts_with("<none>") && !l.contains("sha256") && !l.is_empty())
                .take(20)
                .map(|s| s.to_string())
                .collect();
            let filtered = filter_sensitive(images);
            if !filtered.is_empty() {
                categories.insert("Docker images".to_string(), filtered);
            }
        }
    }

    // ── Shell history: top commands ──
    if areas.contains("shell") {
        if let Some(top_cmds) = scan_shell_history(&home) {
            categories.insert("Shell history (top commands)".to_string(), top_cmds);
        }
    }

    // ── Git: work schedule, languages ──
    if areas.contains("git") {
        if let Some(schedule) = scan_git_schedule() {
            categories.insert("Git (work schedule)".to_string(), schedule);
        }
    }

    // ── Screen Time ──
    if areas.contains("screentime") {
        // macOS Screen Time is sandboxed — we can try the knowledge store
        // but it's restricted. Show system preferences signals instead.
        if cfg!(target_os = "macos") {
            if let Some(prefs) = scan_system_prefs() {
                categories.insert("System preferences".to_string(), prefs);
            }
            // Cloud storage detection
            if let Some(cloud) = detect_cloud_storage(&home) {
                categories.insert("Cloud storage".to_string(), cloud);
            }
            // Obsidian vaults
            if let Some(vaults) = scan_obsidian_vaults(&home) {
                categories.insert("Obsidian vaults".to_string(), vaults);
            }
        }
    }

    // ── Writing style: samples from .md/.txt ──
    if areas.contains("writing") {
        if let Some(samples) = scan_writing_samples(&home) {
            categories.insert("Writing samples".to_string(), samples);
        }
        // Fonts (designer signal)
        if let Some(fonts) = scan_fonts(&home) {
            categories.insert("Fonts".to_string(), fonts);
        }
    }

    // Extract OS username from home directory path (e.g. /Users/john → john)
    let username = home.file_name().map(|n| n.to_string_lossy().to_string());

    Ok(ScanResult {
        categories,
        total_scanned,
        privacy_filtered,
        username,
    })
}

// ─── Helper functions ────────────────────────────────────────

fn scan_folder_recursive(dir: &Path, max_depth: usize) -> Result<Vec<String>, std::io::Error> {
    let mut results = Vec::new();
    walk_dir(dir, &mut results, 0, max_depth);
    Ok(results)
}

fn walk_dir(dir: &Path, results: &mut Vec<String>, depth: usize, max_depth: usize) {
    if depth > max_depth {
        return;
    }
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.filter_map(|e| e.ok()) {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        let path = entry.path();
        if path.is_dir() {
            results.push(format!("{}/", name));
            walk_dir(&path, results, depth + 1, max_depth);
        } else {
            results.push(name);
        }
    }
}

fn run_cmd(program: &str, args: &[&str]) -> Option<String> {
    Command::new(program)
        .args(args)
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
}

fn find_git_repos(home: &Path) -> Vec<String> {
    let mut repos = Vec::new();
    let scan_dirs = [home.join("Desktop"), home.join("Documents")];

    for dir in &scan_dirs {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                if !entry.path().is_dir() {
                    continue;
                }
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with('.') {
                    continue;
                }
                let git_config = entry.path().join(".git/config");
                if git_config.exists() {
                    if let Ok(config) = fs::read_to_string(&git_config) {
                        // Extract remote repo name
                        if let Some(url_line) = config.lines().find(|l| l.trim().starts_with("url = ")) {
                            let url = url_line.trim().trim_start_matches("url = ");
                            let repo_name = url
                                .rsplit('/')
                                .next()
                                .unwrap_or(url)
                                .trim_end_matches(".git");
                            repos.push(format!("{} (remote: {})", name, repo_name));
                        } else {
                            repos.push(format!("{} (local only)", name));
                        }
                    }
                }
            }
        }
    }
    filter_sensitive(repos)
}

fn detect_projects(home: &Path) -> Vec<String> {
    let mut projects = Vec::new();
    let project_markers = [
        ("package.json", "Node.js"),
        ("Cargo.toml", "Rust"),
        ("go.mod", "Go"),
        ("requirements.txt", "Python"),
        ("pyproject.toml", "Python"),
        ("pom.xml", "Java"),
        ("Gemfile", "Ruby"),
    ];
    let scan_dirs = [home.join("Desktop"), home.join("Documents")];

    for dir in &scan_dirs {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                if !entry.path().is_dir() {
                    continue;
                }
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with('.') || name == "node_modules" {
                    continue;
                }
                for (marker, lang) in &project_markers {
                    if entry.path().join(marker).exists() {
                        projects.push(format!("{} ({})", name, lang));
                        break;
                    }
                }
            }
        }
    }
    filter_sensitive(projects)
}

fn scan_recent_files(home: &Path) -> Option<Vec<String>> {
    let output = Command::new("mdfind")
        .args(["kMDItemContentModificationDate >= $time.today(-7)", "-onlyin"])
        .arg(home)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let home_str = home.to_string_lossy();
    let files: Vec<String> = String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter(|l| {
            !l.contains("/Library/")
                && !l.contains("/node_modules/")
                && !l.contains("/.")
                && !l.contains("/target/")
        })
        .take(100)
        .map(|l| {
            let rel = l.replace(&*home_str, "~");
            let parts: Vec<&str> = rel.split('/').collect();
            if parts.len() <= 3 {
                parts.join("/")
            } else {
                format!("{}/.../{}", parts[0], parts.last().unwrap_or(&""))
            }
        })
        .collect();
    let filtered = filter_sensitive(files);
    if filtered.is_empty() {
        None
    } else {
        Some(filtered.into_iter().take(40).collect())
    }
}

fn scan_dock_apps() -> Option<Vec<String>> {
    let output = run_cmd("defaults", &["read", "com.apple.dock", "persistent-apps"])?;
    let apps: Vec<String> = output
        .lines()
        .filter_map(|l| {
            if l.contains("\"file-label\"") {
                let val = l.split('=').nth(1)?.trim().trim_matches(|c| c == '"' || c == ';');
                if val.len() > 1 {
                    Some(val.to_string())
                } else {
                    None
                }
            } else {
                None
            }
        })
        .collect();
    let filtered = filter_sensitive(apps);
    if filtered.is_empty() { None } else { Some(filtered) }
}

fn scan_login_items() -> Option<Vec<String>> {
    let output = run_cmd(
        "osascript",
        &["-e", "tell application \"System Events\" to get the name of every login item"],
    )?;
    let items: Vec<String> = output
        .trim()
        .split(", ")
        .filter(|s| s.len() > 1)
        .map(|s| s.to_string())
        .collect();
    let filtered = filter_sensitive(items);
    if filtered.is_empty() { None } else { Some(filtered) }
}

fn scan_recent_apps() -> Option<Vec<String>> {
    let output = Command::new("mdfind")
        .args([
            "kMDItemLastUsedDate >= $time.today(-14)",
            "-onlyin",
            "/Applications",
        ])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let apps: Vec<String> = String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter(|l| l.ends_with(".app"))
        .filter_map(|l| {
            l.rsplit('/')
                .next()
                .map(|n| n.trim_end_matches(".app").to_string())
        })
        .collect();
    let filtered = filter_sensitive(apps);
    if filtered.is_empty() { None } else { Some(filtered) }
}

fn parse_chrome_bookmarks(path: &Path) -> Option<Vec<String>> {
    let raw = fs::read_to_string(path).ok()?;
    let data: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let mut urls = Vec::new();
    let mut folders = Vec::new();

    fn extract(node: &serde_json::Value, urls: &mut Vec<String>, folders: &mut Vec<String>) {
        if let Some(t) = node.get("type").and_then(|v| v.as_str()) {
            if t == "folder" {
                if let Some(name) = node.get("name").and_then(|v| v.as_str()) {
                    folders.push(name.to_string());
                }
            }
            if t == "url" {
                if let Some(url) = node.get("url").and_then(|v| v.as_str()) {
                    if let Ok(parsed) = url::Url::parse(url) {
                        if let Some(domain) = parsed.host_str() {
                            let clean = domain.trim_start_matches("www.");
                            urls.push(clean.to_string());
                        }
                    }
                }
            }
        }
        if let Some(children) = node.get("children").and_then(|v| v.as_array()) {
            for child in children {
                extract(child, urls, folders);
            }
        }
    }

    if let Some(roots) = data.get("roots") {
        for (_, root) in roots.as_object()? {
            extract(root, &mut urls, &mut folders);
        }
    }

    let mut result: Vec<String> = folders.iter().map(|f| format!("[folder] {}", f)).collect();
    // Dedupe domains
    urls.sort();
    urls.dedup();
    result.extend(urls.into_iter().take(80));

    let filtered = filter_sensitive(result);
    if filtered.is_empty() { None } else { Some(filtered) }
}

fn scan_safari_bookmarks(home: &Path) -> Option<Vec<String>> {
    let plist = home.join("Library/Safari/Bookmarks.plist");
    let output = Command::new("plutil")
        .args(["-convert", "json", "-o", "-"])
        .arg(&plist)
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let data: serde_json::Value =
        serde_json::from_slice(&output.stdout).ok()?;

    let mut urls = Vec::new();
    fn extract_safari(node: &serde_json::Value, urls: &mut Vec<String>) {
        if let Some(url_str) = node.get("URLString").and_then(|v| v.as_str()) {
            if let Ok(parsed) = url::Url::parse(url_str) {
                if let Some(domain) = parsed.host_str() {
                    urls.push(domain.trim_start_matches("www.").to_string());
                }
            }
        }
        if let Some(children) = node.get("Children").and_then(|v| v.as_array()) {
            for child in children {
                extract_safari(child, urls);
            }
        }
    }
    extract_safari(&data, &mut urls);
    urls.sort();
    urls.dedup();
    let filtered = filter_sensitive(urls);
    if filtered.is_empty() { None } else { Some(filtered.into_iter().take(80).collect()) }
}

fn scan_shell_history(home: &Path) -> Option<Vec<String>> {
    let hist_paths = [home.join(".zsh_history"), home.join(".bash_history")];
    for hp in &hist_paths {
        if let Ok(raw) = fs::read_to_string(hp) {
            let mut counts: HashMap<String, usize> = HashMap::new();
            for line in raw.lines() {
                // zsh: ": timestamp:0;command", bash: just "command"
                let cmd_line = if line.starts_with(": ") {
                    line.splitn(2, ';').nth(1).unwrap_or("").trim()
                } else {
                    line.trim()
                };
                let cmd = cmd_line.split_whitespace().next().unwrap_or("");
                if cmd.len() > 1 && !cmd.starts_with('#') {
                    *counts.entry(cmd.to_string()).or_insert(0) += 1;
                }
            }
            let mut sorted: Vec<(String, usize)> = counts.into_iter().collect();
            sorted.sort_by(|a, b| b.1.cmp(&a.1));
            let top: Vec<String> = sorted
                .into_iter()
                .take(30)
                .map(|(cmd, count)| format!("{} ({}x)", cmd, count))
                .collect();
            let filtered = filter_sensitive(top);
            if !filtered.is_empty() {
                return Some(filtered);
            }
        }
    }
    None
}

fn scan_git_schedule() -> Option<Vec<String>> {
    // Get commit hours from the last 90 days
    let output = run_cmd(
        "git",
        &["log", "--all", "--format=%aI", "--since=90.days.ago"],
    )?;
    let mut hour_counts: HashMap<u8, usize> = HashMap::new();
    let mut weekday_counts: HashMap<String, usize> = HashMap::new();

    for line in output.lines() {
        // ISO format: 2026-03-18T14:30:00+01:00
        if let Some(time_part) = line.split('T').nth(1) {
            if let Some(hour_str) = time_part.split(':').next() {
                if let Ok(hour) = hour_str.parse::<u8>() {
                    *hour_counts.entry(hour).or_insert(0) += 1;
                }
            }
        }
        // Day of week from date
        if let Some(date_part) = line.split('T').next() {
            let parts: Vec<&str> = date_part.split('-').collect();
            if parts.len() == 3 {
                // Simple weekday detection
                weekday_counts
                    .entry(date_part.to_string())
                    .or_insert(0);
            }
        }
    }

    if hour_counts.is_empty() {
        return None;
    }

    let mut sorted_hours: Vec<(u8, usize)> = hour_counts.into_iter().collect();
    sorted_hours.sort_by(|a, b| b.1.cmp(&a.1));
    let peak_hours: Vec<String> = sorted_hours
        .iter()
        .take(5)
        .map(|(h, c)| format!("{}:00 ({}x)", h, c))
        .collect();

    let total_commits = sorted_hours.iter().map(|(_, c)| c).sum::<usize>();
    let mut result = vec![format!("{} commits in 90 days", total_commits)];
    result.push(format!("Peak hours: {}", peak_hours.join(", ")));

    Some(result)
}

fn scan_system_prefs() -> Option<Vec<String>> {
    let mut prefs = Vec::new();

    // Dark mode
    if let Some(mode) = run_cmd("defaults", &["read", "-g", "AppleInterfaceStyle"]) {
        prefs.push(format!("Theme: {}", mode.trim()));
    } else {
        prefs.push("Theme: Light".to_string());
    }

    // Fast key repeat = power user
    if let Some(kr) = run_cmd("defaults", &["read", "-g", "KeyRepeat"]) {
        if kr.trim().parse::<i32>().unwrap_or(99) <= 2 {
            prefs.push("Fast key repeat (power user)".to_string());
        }
    }

    // Show file extensions
    if let Some(ext) = run_cmd("defaults", &["read", "NSGlobalDomain", "AppleShowAllExtensions"]) {
        if ext.trim() == "1" {
            prefs.push("Shows file extensions (power user)".to_string());
        }
    }

    // Dock auto-hide
    if let Some(auto) = run_cmd("defaults", &["read", "com.apple.dock", "autohide"]) {
        if auto.trim() == "1" {
            prefs.push("Dock: auto-hide".to_string());
        }
    }

    if prefs.is_empty() { None } else { Some(prefs) }
}

fn detect_cloud_storage(home: &Path) -> Option<Vec<String>> {
    let checks = [
        (home.join("Dropbox"), "Dropbox"),
        (home.join("OneDrive"), "OneDrive"),
        (home.join("Google Drive"), "Google Drive"),
        (home.join("Library/CloudStorage"), "iCloud"),
    ];
    let found: Vec<String> = checks
        .iter()
        .filter(|(p, _)| p.exists())
        .map(|(_, label)| label.to_string())
        .collect();
    if found.is_empty() { None } else { Some(found) }
}

fn scan_obsidian_vaults(home: &Path) -> Option<Vec<String>> {
    let config = home.join("Library/Application Support/obsidian/obsidian.json");
    let raw = fs::read_to_string(config).ok()?;
    let data: serde_json::Value = serde_json::from_str(&raw).ok()?;
    let vaults = data.get("vaults")?.as_object()?;
    let names: Vec<String> = vaults
        .values()
        .filter_map(|v| {
            v.get("path")
                .and_then(|p| p.as_str())
                .and_then(|p| Path::new(p).file_name())
                .map(|n| n.to_string_lossy().to_string())
        })
        .collect();
    let filtered = filter_sensitive(names);
    if filtered.is_empty() { None } else { Some(filtered) }
}

fn scan_writing_samples(home: &Path) -> Option<Vec<String>> {
    // Find up to 5 .md/.txt files and read first 500 chars
    let mut samples = Vec::new();
    let scan_dirs = [home.join("Desktop"), home.join("Documents")];

    for dir in &scan_dirs {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                let name = entry.file_name().to_string_lossy().to_string();
                if (name.ends_with(".md") || name.ends_with(".txt"))
                    && !is_sensitive(&name)
                    && entry.metadata().map(|m| m.len() < 50_000).unwrap_or(false)
                {
                    if let Ok(content) = fs::read_to_string(entry.path()) {
                        let preview: String = content.chars().take(500).collect();
                        samples.push(format!("[{}] {}", name, preview));
                    }
                    if samples.len() >= 5 {
                        break;
                    }
                }
            }
        }
        if samples.len() >= 5 {
            break;
        }
    }

    if samples.is_empty() { None } else { Some(samples) }
}

fn scan_fonts(home: &Path) -> Option<Vec<String>> {
    let font_dir = home.join("Library/Fonts");
    let entries = fs::read_dir(font_dir).ok()?;
    let fonts: Vec<String> = entries
        .filter_map(|e| e.ok())
        .map(|e| e.file_name().to_string_lossy().to_string())
        .collect();
    let count = fonts.len();
    let interesting: Vec<String> = fonts
        .iter()
        .filter(|f| {
            let lower = f.to_lowercase();
            lower.contains("fira")
                || lower.contains("jetbrains")
                || lower.contains("source")
                || lower.contains("roboto")
                || lower.contains("inter")
                || lower.contains("comic")
                || lower.contains("mono")
        })
        .take(10)
        .cloned()
        .collect();
    let mut result = vec![format!("{} custom fonts", count)];
    result.extend(interesting);
    Some(result)
}

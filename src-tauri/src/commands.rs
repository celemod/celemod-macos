use crate::blacklist::{self, ModBlacklistProfile};
use crate::everest;
use crate::types::*;
use crate::ureq::{self, DownloadCallbackInfo};

use anyhow::{bail, Context};
use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

// ============================================================
// Shared state
// ============================================================

pub struct DownloadState {
    pub cancel_flags: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

// ============================================================
// Helpers from original main.rs
// ============================================================

pub fn compare_version(a: &str, b: &str) -> i32 {
    let a_parts: Vec<&str> = a.split('.').collect();
    let b_parts: Vec<&str> = b.split('.').collect();
    for i in 0..std::cmp::max(a_parts.len(), b_parts.len()) {
        let a_part = a_parts.get(i).unwrap_or(&"0");
        let b_part = b_parts.get(i).unwrap_or(&"0");
        if a_part == b_part {
            continue;
        }
        if a_part.parse::<i32>().unwrap() > b_part.parse::<i32>().unwrap() {
            return 1;
        } else {
            return -1;
        }
    }
    0
}

fn extract_mod_for_yaml(path: &PathBuf) -> anyhow::Result<serde_yaml::Value> {
    let zipfile = std::fs::File::open(path)?;
    let mut archive = zip::ZipArchive::new(zipfile)?;
    let everest_name = archive
        .file_names()
        .find(|name| name == &"everest.yaml" || name == &"everest.yml")
        .context("Failed to find everest.yaml")?
        .to_string();

    let everest = archive.by_name(&everest_name);
    if let Ok(mut file) = everest {
        use std::io::prelude::*;

        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer)?;
        let cache_dir = path
            .parent()
            .unwrap()
            .parent()
            .unwrap()
            .join("celemod_yaml_cache");
        std::fs::create_dir_all(&cache_dir)?;

        let mut file = std::fs::File::create(
            cache_dir.join(path.with_extension("yaml").file_name().unwrap()),
        )?;
        file.write_all(&buffer)?;
        use strip_bom::StripBom;
        Ok(serde_yaml::from_str(
            String::from_utf8(buffer)?.strip_bom(),
        )?)
    } else {
        bail!("Failed to get everest.yaml")
    }
}

fn is_valid_zip_archive(path: &Path) -> bool {
    std::fs::File::open(path)
        .ok()
        .and_then(|file| zip::ZipArchive::new(file).ok())
        .is_some()
}

pub fn get_invalid_zip_mod_files(mods_folder_path: &str) -> Vec<String> {
    let Ok(entries) = std::fs::read_dir(mods_folder_path) else {
        return Vec::new();
    };

    entries
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.file_type().map(|v| v.is_file()).unwrap_or(false))
        .filter(|entry| {
            entry
                .path()
                .extension()
                .map(|v| v == "zip")
                .unwrap_or(false)
        })
        .filter(|entry| !is_valid_zip_archive(&entry.path()))
        .filter_map(|entry| entry.file_name().into_string().ok())
        .collect()
}

fn get_zip_mod_entries(mods_folder_path: &str) -> Vec<std::fs::DirEntry> {
    let Ok(entries) = std::fs::read_dir(mods_folder_path) else {
        return Vec::new();
    };

    entries
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.file_type().map(|v| v.is_file()).unwrap_or(false))
        .filter(|entry| {
            entry
                .path()
                .extension()
                .map(|v| v.eq_ignore_ascii_case("zip"))
                .unwrap_or(false)
        })
        .collect()
}

fn check_zip_mod_file_content(path: &Path) -> anyhow::Result<()> {
    let file = std::fs::File::open(path)?;
    let mut archive = zip::ZipArchive::new(file)?;
    let mut buffer = vec![0_u8; 64 * 1024];

    for index in 0..archive.len() {
        let mut entry = archive.by_index(index)?;
        loop {
            let read = entry.read(&mut buffer)?;
            if read == 0 {
                break;
            }
        }
    }

    Ok(())
}

fn internal_check_all_mod_contents(
    mods_folder_path: &str,
    progress_callback: &mut dyn FnMut(FullModCheckProgress),
) {
    let entries = get_zip_mod_entries(mods_folder_path);
    let total = entries.len();
    let mut issues = Vec::new();

    progress_callback(FullModCheckProgress {
        current: 0,
        total,
        file: String::new(),
        done: total == 0,
        issues: Vec::new(),
    });

    if total == 0 {
        return;
    }

    for (index, entry) in entries.into_iter().enumerate() {
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().to_string();
        if let Err(err) = check_zip_mod_file_content(&path) {
            issues.push(FullModCheckIssue {
                file: file_name.clone(),
                error: format!("{err:#}"),
            });
        }

        progress_callback(FullModCheckProgress {
            current: index + 1,
            total,
            file: file_name,
            done: index + 1 == total,
            issues: if index + 1 == total {
                issues.clone()
            } else {
                Vec::new()
            },
        });
    }
}

fn internal_delete_mod_files(mods_folder_path: &str, file_names: &[String]) -> anyhow::Result<()> {
    for file_name in file_names {
        let safe_name = Path::new(file_name)
            .file_name()
            .context("Invalid mod file name")?;
        let path = Path::new(mods_folder_path).join(safe_name);
        if path.exists() {
            std::fs::remove_file(path)?;
        }
    }
    Ok(())
}

fn download_mod_archive_with_cancel(
    url: &str,
    dest: &str,
    progress_callback: &mut dyn FnMut(DownloadCallbackInfo),
    multi_thread: bool,
    cancel_flag: &Arc<AtomicBool>,
) -> anyhow::Result<()> {
    let tmp_dir = std::env::temp_dir().join("CelemodTemp").join("mods");
    std::fs::create_dir_all(&tmp_dir)?;

    let file_name = Path::new(dest)
        .file_name()
        .context("Failed to resolve destination file name")?;
    let tmp_dest = tmp_dir.join(file_name);

    let result: anyhow::Result<()> = (|| -> anyhow::Result<()> {
        ureq::download_file_with_progress(
            url,
            tmp_dest.to_string_lossy().as_ref(),
            progress_callback,
            multi_thread,
            cancel_flag,
        )?;

        if !is_valid_zip_archive(&tmp_dest) {
            bail!("Downloaded file is not a valid zip archive");
        }

        std::fs::copy(&tmp_dest, dest)
            .with_context(|| format!("Failed to move downloaded file to {}", dest))?;
        Ok(())
    })();

    std::fs::remove_file(&tmp_dest).ok();
    result
}

fn read_to_string_bom(path: &Path) -> anyhow::Result<String> {
    use std::io::Read;
    let mut file = std::fs::File::open(path)?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)?;
    let bytes = bytes
        .strip_prefix("\u{feff}".as_bytes())
        .unwrap_or(bytes.as_slice());
    Ok(String::from_utf8(bytes.to_vec())?)
}

fn parse_version(mod_version: &serde_yaml::Value) -> String {
    if let Some(f) = mod_version.as_f64() {
        return f.to_string();
    }

    let v_str = mod_version.as_str().unwrap_or("1.0.0");

    let start_idx = v_str.find(|c: char| c.is_ascii_digit()).unwrap_or(0);
    let trimmed = &v_str[start_idx..];

    if !trimmed.is_empty() && trimmed.chars().next().unwrap().is_ascii_digit() {
        trimmed.to_string()
    } else {
        "1.0.0".to_string()
    }
}

fn make_path_compatible_name(name: &str) -> String {
    name.replace([' ', ':', '/', '\\', '?', '*', '\"', '<', '>', '|'], "_")
}

pub fn get_installed_mods_sync(mods_folder_path: String) -> Vec<LocalMod> {
    let mut mods = Vec::new();
    let mod_data = everest::get_mod_cached_new().unwrap();

    let Ok(entries) = std::fs::read_dir(mods_folder_path) else {
        return mods;
    };

    for entry in entries {
        let Ok(entry) = entry else {
            continue;
        };
        // Skip entries that aren't mods (blacklist.txt, Cache, etc.)
        let is_dir = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
        let is_zip = entry
            .path()
            .extension()
            .map(|e| e == "zip")
            .unwrap_or(false);
        if !is_dir && !is_zip {
            continue;
        }
        // Skip directories that don't contain everest.yaml/everest.yml
        if is_dir {
            let has_everest_yaml = entry
                .path()
                .read_dir()
                .map(|rd| {
                    rd.filter_map(|e| e.ok()).any(|e| {
                        let name = e.file_name().to_string_lossy().to_lowercase();
                        name == "everest.yaml" || name == "everest.yml"
                    })
                })
                .unwrap_or(false);
            if !has_everest_yaml {
                continue;
            }
        }
        let res: anyhow::Result<_> = (|| -> anyhow::Result<LocalMod> {
            let yaml = if is_dir {
                let yaml_path = entry
                    .path()
                    .read_dir()
                    .unwrap()
                    .find(|v| {
                        v.as_ref().is_ok_and(|v| {
                            let name = v.file_name().to_string_lossy().to_string().to_lowercase();
                            name == "everest.yaml" || name == "everest.yml"
                        })
                    })
                    .unwrap()
                    .unwrap()
                    .path();
                read_to_string_bom(&yaml_path)?
            } else if entry
                .path()
                .extension()
                .context("Unable to get the extension")?
                == "zip"
            {
                let cache_path = entry
                    .path()
                    .parent()
                    .unwrap()
                    .parent()
                    .unwrap()
                    .join("celemod_yaml_cache")
                    .join(entry.path().with_extension("yaml").file_name().unwrap());

                let mod_date = entry.metadata().unwrap().modified().unwrap();
                let cache_date = cache_path.metadata().ok().map(|v| v.modified().unwrap());

                if !cache_path.exists() || cache_date.is_none() || cache_date.unwrap() < mod_date {
                    extract_mod_for_yaml(&entry.path())?;
                }
                read_to_string_bom(&cache_path)?
            } else {
                anyhow::bail!("Not a zip or directory");
            };

            let yaml: serde_yaml::Value =
                serde_yaml::from_str(&yaml).context("Failed to parse yaml")?;

            let mut deps: Vec<ModDependency> = Vec::new();

            if let Some(deps_yaml) = yaml[0]["Dependencies"].as_sequence() {
                for dep in deps_yaml {
                    deps.push(ModDependency {
                        name: dep["Name"].as_str().unwrap().to_string(),
                        version: parse_version(&dep["Version"]),
                        optional: false,
                    });
                }
            }

            if let Some(deps_yaml) = yaml[0]["OptionalDependencies"].as_sequence() {
                for dep in deps_yaml {
                    deps.push(ModDependency {
                        name: dep["Name"].as_str().unwrap().to_string(),
                        version: parse_version(&dep["Version"]),
                        optional: true,
                    });
                }
            }

            let name = yaml[0]["Name"].as_str().context("")?.to_string();
            let version = parse_version(&yaml[0]["Version"]);
            let gbid = if mod_data.contains_key(&name) {
                mod_data[&name].game_banana_id
            } else {
                -1
            };
            let size = entry.metadata().unwrap().len();

            Ok(LocalMod {
                name,
                version,
                game_banana_id: gbid,
                deps,
                file: entry.file_name().to_str().unwrap().to_string(),
                size,
            })
        })();

        if let Err(e) = res {
            println!("[ WARNING ] Failed to parse {:?}: {}", entry.file_name(), e)
        } else {
            mods.push(res.unwrap());
        }
    }
    mods
}

fn download_and_install_mod(
    url: &str,
    dest: &String,
    progress_callback: &mut dyn FnMut(DownloadCallbackInfo),
    multi_thread: bool,
    cancel_flag: &Arc<AtomicBool>,
) -> anyhow::Result<Vec<(String, String)>> {
    download_mod_archive_with_cancel(url, dest, progress_callback, multi_thread, cancel_flag)?;

    let yaml = extract_mod_for_yaml(&Path::new(&dest).to_path_buf())?;

    let mut deps: Vec<(String, String)> = Vec::new();

    if let Some(deps_yaml) = yaml[0]["Dependencies"].as_sequence() {
        for dep in deps_yaml {
            let version = parse_version(&dep["Version"]);
            deps.push((
                dep["Name"]
                    .as_str()
                    .context("Interrupted yaml dependency")?
                    .to_string(),
                version,
            ));
        }
    }
    Ok(deps)
}

fn internal_rm_mod(mods_folder_path: &str, mod_name: &str) -> anyhow::Result<()> {
    let mods = get_installed_mods_sync(mods_folder_path.to_string());
    for mod_ in mods {
        if mod_.name == mod_name {
            let path = Path::new(mods_folder_path).join(&mod_.file);
            if path.exists() {
                if path.is_dir() {
                    std::fs::remove_dir_all(path)?;
                } else {
                    std::fs::remove_file(path)?;
                }
            }
        }
    }
    Ok(())
}

fn get_celestes() -> Vec<game_scanner::prelude::Game> {
    let mut games = vec![];
    use game_scanner::*;
    if let Ok(game) = steam::find("504230") {
        games.push(game);
    };

    if let Ok(game) = epicgames::find("9ae799adceab466a97fbc0408d12c5b8") {
        games.push(game);
    };

    games
}

fn normalize_game_path_buf(path: &Path) -> PathBuf {
    #[cfg(target_os = "macos")]
    {
        fn has_game_artifact(path: &Path) -> bool {
            path.join("Celeste.exe").is_file()
                || path.join("Celeste.dll").is_file()
                || path.join("Celeste").is_file()
        }

        fn is_named(path: &Path, name: &str) -> bool {
            path.file_name().and_then(|v| v.to_str()) == Some(name)
        }

        fn resources_if_valid(path: PathBuf) -> Option<PathBuf> {
            if path.is_dir()
                && (has_game_artifact(&path)
                    || path
                        .parent()
                        .map(|contents| contents.join("MacOS").join("Celeste").is_file())
                        .unwrap_or(false))
            {
                Some(path)
            } else {
                None
            }
        }

        let path = if path.is_file() {
            path.parent().unwrap_or(path)
        } else {
            path
        };

        if is_named(path, "Resources") {
            if let Some(resources) = resources_if_valid(path.to_path_buf()) {
                return resources;
            }
        }

        if is_named(path, "MacOS") {
            if let Some(contents) = path.parent() {
                if let Some(resources) = resources_if_valid(contents.join("Resources")) {
                    return resources;
                }
            }
        }

        if is_named(path, "Contents") {
            if let Some(resources) = resources_if_valid(path.join("Resources")) {
                return resources;
            }
        }

        if path.extension().and_then(|v| v.to_str()) == Some("app") {
            if let Some(resources) = resources_if_valid(path.join("Contents").join("Resources")) {
                return resources;
            }
        }

        if let Some(resources) =
            resources_if_valid(path.join("Celeste.app").join("Contents").join("Resources"))
        {
            return resources;
        }

        if has_game_artifact(path) {
            if let Some(parent) = path.parent() {
                if is_named(parent, "Contents") {
                    if let Some(resources) = resources_if_valid(parent.join("Resources")) {
                        return resources;
                    }
                }
            }
        }
    }

    path.to_path_buf()
}

fn normalize_game_path(path: &str) -> String {
    normalize_game_path_buf(Path::new(path))
        .to_string_lossy()
        .to_string()
}

// ============================================================
// Tauri Commands
// ============================================================

#[tauri::command]
pub fn celemod_version() -> String {
    env!("VERSION").to_string()
}

#[tauri::command]
pub fn celemod_hash() -> String {
    env!("GIT_HASH").to_string()
}

#[tauri::command]
pub fn get_celeste_dirs() -> Vec<String> {
    let test_mode = std::env::args().any(|a| a == "--test-mode");
    if test_mode {
        let path = std::env::temp_dir().join("celemod_test_game");
        let _ = std::fs::create_dir_all(path.join("Mods"));
        #[cfg(windows)]
        let _ = std::fs::write(path.join("Celeste.exe"), b"");
        #[cfg(unix)]
        let _ = std::fs::write(path.join("Celeste"), b"");
        return vec![path.to_string_lossy().to_string()];
    }
    get_celestes()
        .iter()
        .filter_map(|game| game.path.clone())
        .map(|path| normalize_game_path_buf(&path))
        .map(|path| path.to_string_lossy().to_string())
        .collect()
}

#[tauri::command]
pub fn start_game(path: String) {
    let path = normalize_game_path(&path);
    let celestes = get_celestes();
    if let Some(game) = celestes.iter().find(|game| {
        game.path
            .as_ref()
            .map(|p| normalize_game_path_buf(p).to_string_lossy().to_string() == path)
            .unwrap_or(false)
    }) {
        game_scanner::manager::launch_game(game).unwrap();
    } else {
        start_game_directly(path, false);
    }
}

#[tauri::command]
pub fn start_game_directly(path: String, origin: bool) {
    let path = normalize_game_path(&path);
    let path = Path::new(&path);

    #[cfg(windows)]
    let game = path.join("Celeste.exe");

    #[cfg(all(unix, not(target_os = "macos")))]
    let game = path.join("Celeste");

    #[cfg(target_os = "macos")]
    let game = {
        let direct = path.join("Celeste");
        if direct.exists() {
            direct
        } else if path.file_name().and_then(|name| name.to_str()) == Some("Resources") {
            path.parent().unwrap_or(path).join("MacOS").join("Celeste")
        } else {
            direct
        }
    };

    let game_origin = path.join("orig").join(
        game.file_name()
            .unwrap_or_else(|| std::ffi::OsStr::new("Celeste")),
    );

    if origin {
        if game_origin.exists() {
            std::process::Command::new(game_origin)
                .arg("--vanilla")
                .spawn()
                .unwrap();
        } else {
            std::process::Command::new(game).spawn().unwrap();
        }
    } else {
        std::process::Command::new(game).spawn().unwrap();
    }
}

#[tauri::command]
pub async fn get_installed_mods(mods_folder_path: String) -> Vec<LocalMod> {
    tokio::task::spawn_blocking(move || get_installed_mods_sync(mods_folder_path))
        .await
        .unwrap_or_default()
}

#[tauri::command]
pub async fn get_installed_mod_ids(mods_folder_path: String) -> Vec<String> {
    tokio::task::spawn_blocking(move || {
        get_installed_mods_sync(mods_folder_path)
            .into_iter()
            .map(|v| v.game_banana_id.to_string())
            .collect::<Vec<_>>()
    })
    .await
    .unwrap_or_default()
}

#[tauri::command]
pub fn get_invalid_zip_mod_files_cmd(mods_folder_path: String) -> Vec<String> {
    get_invalid_zip_mod_files(&mods_folder_path)
}

#[tauri::command]
pub fn get_installed_miaonet(mods_folder_path: String) -> bool {
    get_installed_mods_sync(mods_folder_path)
        .into_iter()
        .any(|p| p.name == "MiaoNet")
}

#[tauri::command]
pub fn get_blacklist_profiles(game_path: String) -> Vec<ModBlacklistProfile> {
    blacklist::get_mod_blacklist_profiles(&game_path)
}

#[tauri::command]
pub fn apply_blacklist_profile(
    game_path: String,
    profile_name: String,
    always_on_mods: Vec<String>,
) -> Result<String, String> {
    let result = blacklist::apply_mod_blacklist_profile(&game_path, &profile_name, &always_on_mods);
    result
        .map(|_| "Success".to_string())
        .map_err(|e| format!("Failed to apply blacklist profile: {}", e))
}

#[tauri::command]
pub fn switch_mod_blacklist_profile(
    game_path: String,
    profile_name: String,
    mod_names: Vec<String>,
    mod_files: Vec<String>,
    enabled: bool,
) -> Result<String, String> {
    let mods: Vec<(&String, &String)> = mod_names.iter().zip(mod_files.iter()).collect();
    let result = blacklist::switch_mod_blacklist_profile(&game_path, &profile_name, mods, enabled);
    result
        .map(|_| "Success".to_string())
        .map_err(|e| format!("Failed to switch blacklist profile: {}", e))
}

#[tauri::command]
pub fn new_mod_blacklist_profile(
    game_path: String,
    profile_name: String,
) -> Result<String, String> {
    let result = blacklist::new_mod_blacklist_profile(&game_path, &profile_name);
    result
        .map(|_| "Success".to_string())
        .map_err(|e| format!("Failed to create blacklist profile: {}", e))
}

#[tauri::command]
pub fn get_current_profile(game_path: String) -> String {
    let result = blacklist::get_current_profile(&game_path);
    result.unwrap_or_else(|e| {
        eprintln!("Failed to get current profile: {}", e);
        "Default".to_string()
    })
}

#[tauri::command]
pub fn remove_mod_blacklist_profile(
    game_path: String,
    profile_name: String,
) -> Result<String, String> {
    let result = blacklist::remove_mod_blacklist_profile(&game_path, &profile_name);
    result
        .map(|_| "Success".to_string())
        .map_err(|e| format!("Failed to remove blacklist profile: {}", e))
}

#[tauri::command]
pub fn get_mod_update(name: String) -> Option<(String, String)> {
    let res: anyhow::Result<(String, String)> = (|| {
        let mods = everest::get_mod_cached_new()?;
        let m = mods.get(&name).context("Mod not found")?;
        Ok((m.game_banana_file_id.to_string(), m.version.clone()))
    })();
    res.ok()
}

#[tauri::command]
pub fn get_mod_latest_info() -> Vec<(String, String, String, String)> {
    let mods = match everest::get_mod_cached_new() {
        Ok(m) => m,
        Err(_) => return vec![],
    };
    mods.iter()
        .map(|(k, v)| {
            (
                k.clone(),
                v.version.clone(),
                v.game_banana_file_id.to_string(),
                v.download_url.clone(),
            )
        })
        .collect()
}

#[tauri::command]
pub fn rm_mod(mods_folder_path: String, mod_name: String) {
    if let Err(e) = internal_rm_mod(&mods_folder_path, &mod_name) {
        eprintln!("Failed to remove mod: {}", e);
    }
}

#[tauri::command]
pub fn delete_mods(game_path: String, mod_names: Vec<String>) -> Result<String, String> {
    let game_path = normalize_game_path(&game_path);
    let mods_folder_path = Path::new(&game_path)
        .join("Mods")
        .to_string_lossy()
        .to_string();

    let mut failed_mods = Vec::new();

    for mod_name in &mod_names {
        if let Err(e) = internal_rm_mod(&mods_folder_path, mod_name) {
            eprintln!("Failed to remove mod {}: {}", mod_name, e);
            failed_mods.push(format!("{}: {}", mod_name, e));
        }
    }

    if failed_mods.is_empty() {
        Ok("Success".to_string())
    } else {
        Err(format!(
            "Failed to remove some mods: {}",
            failed_mods.join(", ")
        ))
    }
}

#[tauri::command]
pub fn delete_mod_files(
    mods_folder_path: String,
    file_names: Vec<String>,
) -> Result<String, String> {
    let result = internal_delete_mod_files(&mods_folder_path, &file_names);
    result
        .map(|_| "Success".to_string())
        .map_err(|e| format!("Failed to remove some files: {}", e))
}

#[tauri::command]
pub fn get_everest_version(game_path: String) -> String {
    let test_mode = std::env::args().any(|a| a == "--test-mode");
    if test_mode {
        return "4000".to_string();
    }
    let game_path = normalize_game_path(&game_path);
    everest::get_everest_version(&game_path)
        .map(|v| v.to_string())
        .unwrap_or_default()
}

#[tauri::command]
pub fn verify_celeste_install(path: String) -> bool {
    let test_mode = std::env::args().any(|a| a == "--test-mode");
    let test_path = std::env::temp_dir().join("celemod_test_game");
    if test_mode && path == test_path.to_string_lossy().to_string() {
        return true;
    }
    let path = normalize_game_path(&path);
    let path = Path::new(&path);
    let checklist = vec!["Celeste.exe", "Celeste", "Celeste.dll"];
    for file in checklist {
        if path.join(file).exists() {
            return true;
        }
    }
    #[cfg(target_os = "macos")]
    {
        if path.file_name().and_then(|name| name.to_str()) == Some("Resources")
            && path
                .parent()
                .map(|contents| contents.join("MacOS").join("Celeste").exists())
                .unwrap_or(false)
        {
            return true;
        }
    }
    false
}

#[tauri::command]
pub fn normalize_game_path_cmd(path: String) -> String {
    normalize_game_path(&path)
}

#[tauri::command]
pub fn get_current_blacklist_content(game_path: String) -> String {
    let result = blacklist::get_current_blacklist_content(&game_path);
    result.unwrap_or_default()
}

#[tauri::command]
pub fn sync_blacklist_profile_from_file(
    game_path: String,
    profile_name: String,
) -> Result<String, String> {
    let result = blacklist::sync_blacklist_profile_from_file(&game_path, &profile_name);
    result
        .map(|_| "Success".to_string())
        .map_err(|e| format!("Failed to sync blacklist profile: {}", e))
}

#[tauri::command]
pub fn is_using_cache() -> bool {
    everest::is_using_cache()
}

#[tauri::command]
pub fn set_mod_options_order(
    game_path: String,
    profile_name: String,
    order: Vec<String>,
) -> Result<String, String> {
    let result = blacklist::set_mod_options_order(&game_path, &profile_name, order);
    result
        .map(|_| "Success".to_string())
        .map_err(|e| format!("Failed to set mod options order: {}", e))
}

#[tauri::command]
pub fn open_url(url: String) {
    if let Err(e) = open::that(&url) {
        eprintln!("Failed to open url: {}", e);
    }
}

#[tauri::command]
pub fn show_log_window() {
    #[cfg(windows)]
    {
        #[cfg(not(debug_assertions))]
        {
            use winapi::um::winuser::{ShowWindow, SW_SHOW};
            unsafe {
                ShowWindow(winapi::um::wincon::GetConsoleWindow(), SW_SHOW);
            }
        }
    }
}

#[tauri::command]
pub fn cancel_download_mod(name: String) -> bool {
    // The cancel flag is managed inside download_mod via the DownloadState
    eprintln!("cancel_download_mod called for {}", name);
    true
}

// ============================================================
// Event-based commands (progress via Tauri events)
// ============================================================

#[tauri::command]
pub async fn download_mod(
    app: AppHandle,
    name: String,
    url: String,
    mods_dir: String,
    auto_disable_new_mods: bool,
    multi_thread: bool,
) -> Result<(), String> {
    if let Err(e) = std::fs::create_dir_all(&mods_dir) {
        eprintln!("Failed to create mods dir {}: {}", mods_dir, e);
    }

    let dest = Path::new(&mods_dir)
        .join(make_path_compatible_name(&name) + ".zip")
        .to_str()
        .unwrap()
        .to_string();

    let app_handle = app.clone();
    let cancel_flag: Arc<AtomicBool> = Arc::new(AtomicBool::new(false));
    let queued_deps: Arc<Mutex<HashSet<String>>> = Arc::new(Mutex::new(HashSet::new()));
    let active_count: Arc<AtomicUsize> = Arc::new(AtomicUsize::new(0));
    let any_failed: Arc<AtomicBool> = Arc::new(AtomicBool::new(false));
    let tasklist: Arc<Mutex<Vec<DownloadInfo>>> = Arc::new(Mutex::new(Vec::new()));
    let (done_tx, done_rx) = std::sync::mpsc::channel::<()>();

    {
        let mut tl = tasklist.lock().unwrap();
        tl.push(DownloadInfo {
            name: name.clone(),
            url: url.clone(),
            dest: dest.clone(),
            status: DownloadStatus::Waiting,
            data: "".to_string(),
            downloaded_bytes: 0,
            total_bytes: 0,
            speed_bytes_per_sec: 0.0,
        });
        queued_deps.lock().unwrap().insert(name.clone());
    }

    let mod_data = match everest::get_mod_cached_new() {
        Ok(d) => d,
        Err(e) => {
            return Err(format!("Failed to get mod data: {}", e));
        }
    };

    // Helper to emit progress
    let app_handle_clone = app_handle.clone();
    let emit_progress: Arc<dyn Fn(&Vec<DownloadInfo>, &str) + Send + Sync> =
        Arc::new(move |tl: &Vec<DownloadInfo>, state: &str| {
            let payload = DownloadProgressPayload {
                subtasks: tl.clone(),
                state: state.to_string(),
            };
            let _ = app_handle_clone.emit("download-mod-progress", payload);
        });

    fn spawn_download_task(
        task_index: usize,
        tasklist: Arc<Mutex<Vec<DownloadInfo>>>,
        cancel_flag: Arc<AtomicBool>,
        queued_deps: Arc<Mutex<HashSet<String>>>,
        active_count: Arc<AtomicUsize>,
        any_failed: Arc<AtomicBool>,
        mod_data: Arc<std::collections::HashMap<String, crate::everest::ModInfoCached>>,
        mods_dir: String,
        multi_thread: bool,
        emit_progress: Arc<dyn Fn(&Vec<DownloadInfo>, &str) + Send + Sync>,
        done_tx: std::sync::mpsc::Sender<()>,
    ) {
        active_count.fetch_add(1, Ordering::SeqCst);
        std::thread::spawn(move || {
            let task_info = {
                let tl = tasklist.lock().unwrap();
                tl[task_index].clone()
            };

            {
                let mut tl = tasklist.lock().unwrap();
                tl[task_index].status = DownloadStatus::Downloading;
                emit_progress(&tl, "pending");
            }

            let result = {
                let tasklist_clone = Arc::clone(&tasklist);
                let emit_cb = Arc::clone(&emit_progress);
                let cancel_flag = Arc::clone(&cancel_flag);
                download_and_install_mod(
                    &task_info.url,
                    &task_info.dest,
                    &mut move |progress| {
                        let mut tl = tasklist_clone.lock().unwrap();
                        tl[task_index].data = format!("{:.2}", progress.progress);
                        tl[task_index].downloaded_bytes = progress.downloaded_bytes;
                        tl[task_index].total_bytes = progress.total_bytes;
                        tl[task_index].speed_bytes_per_sec = progress.speed_bytes_per_sec;
                        tl[task_index].status = DownloadStatus::Downloading;
                        emit_cb(&tl, "pending");
                    },
                    multi_thread,
                    &cancel_flag,
                )
            };

            match result {
                Ok(deps) => {
                    {
                        let mut tl = tasklist.lock().unwrap();
                        tl[task_index].status = DownloadStatus::Finished;
                        tl[task_index].data = "100".to_string();
                        tl[task_index].speed_bytes_per_sec = 0.0;
                        emit_progress(&tl, "pending");
                    }

                    // Queue new dependency downloads
                    let installed_mods = get_installed_mods_sync(mods_dir.clone());
                    let new_tasks: Vec<DownloadInfo> = {
                        let mut queued = queued_deps.lock().unwrap();
                        deps.into_iter()
                            .filter_map(|(dep, min_ver)| {
                                if installed_mods.iter().any(|m| {
                                    m.name == dep
                                        && crate::commands::compare_version(&m.version, &min_ver)
                                            >= 0
                                }) {
                                    return None;
                                }
                                if queued.contains(&dep) {
                                    return None;
                                }
                                if let Some(data) = mod_data.get(&dep) {
                                    queued.insert(dep.clone());
                                    let dep_dest = Path::new(&mods_dir)
                                        .join(make_path_compatible_name(&dep) + ".zip")
                                        .to_str()
                                        .unwrap()
                                        .to_string();
                                    Some(DownloadInfo {
                                        name: dep,
                                        url: data.download_url.clone(),
                                        dest: dep_dest,
                                        status: DownloadStatus::Waiting,
                                        data: "0".to_string(),
                                        downloaded_bytes: 0,
                                        total_bytes: 0,
                                        speed_bytes_per_sec: 0.0,
                                    })
                                } else {
                                    println!("[ WARNING ] Failed to resolve {dep}");
                                    None
                                }
                            })
                            .collect()
                    };

                    let new_indices: Vec<usize> = {
                        let mut tl = tasklist.lock().unwrap();
                        let start = tl.len();
                        tl.extend(new_tasks);
                        (start..tl.len()).collect()
                    };

                    for idx in new_indices {
                        spawn_download_task(
                            idx,
                            Arc::clone(&tasklist),
                            Arc::clone(&cancel_flag),
                            Arc::clone(&queued_deps),
                            Arc::clone(&active_count),
                            Arc::clone(&any_failed),
                            Arc::clone(&mod_data),
                            mods_dir.clone(),
                            multi_thread,
                            Arc::clone(&emit_progress),
                            done_tx.clone(),
                        );
                    }
                }
                Err(e) => {
                    any_failed.store(true, Ordering::SeqCst);
                    let mut tl = tasklist.lock().unwrap();
                    tl[task_index].status = DownloadStatus::Failed;
                    tl[task_index].data = e.to_string();
                    tl[task_index].speed_bytes_per_sec = 0.0;
                    let _ = std::fs::remove_file(&tl[task_index].dest);
                    emit_progress(&tl, "failed");
                }
            }

            if active_count.fetch_sub(1, Ordering::SeqCst) == 1 {
                let _ = done_tx.send(());
            }
        });
    }

    let emit_progress = Arc::new(emit_progress);

    spawn_download_task(
        0,
        Arc::clone(&tasklist),
        Arc::clone(&cancel_flag),
        Arc::clone(&queued_deps),
        Arc::clone(&active_count),
        Arc::clone(&any_failed),
        Arc::clone(&mod_data),
        mods_dir.clone(),
        multi_thread,
        Arc::clone(&emit_progress),
        done_tx,
    );

    let _ = done_rx.recv();

    if any_failed.load(Ordering::SeqCst) {
        return Err("Download failed".to_string());
    }

    // Auto-disable new mods if enabled
    if auto_disable_new_mods {
        let game_path = Path::new(&mods_dir)
            .parent()
            .unwrap()
            .to_str()
            .unwrap()
            .to_string();
        let profiles = blacklist::get_mod_blacklist_profiles(&game_path);
        let new_mods: Vec<String> = {
            let tl = tasklist.lock().unwrap();
            tl.iter()
                .filter(|t| t.status == DownloadStatus::Finished)
                .map(|t| t.name.clone())
                .collect()
        };
        if !new_mods.is_empty() {
            let installed_mods = get_installed_mods_sync(mods_dir.clone());
            let mods_to_disable: Vec<(&String, &String)> = new_mods
                .iter()
                .filter_map(|name| {
                    installed_mods
                        .iter()
                        .find(|m| m.name == *name)
                        .map(|m| (&m.name, &m.file))
                })
                .collect();
            if !mods_to_disable.is_empty() {
                for profile in profiles {
                    if let Err(e) = blacklist::switch_mod_blacklist_profile(
                        &game_path,
                        &profile.name,
                        mods_to_disable.clone(),
                        false,
                    ) {
                        eprintln!("Failed to auto-disable mods: {}", e);
                    }
                }
            }
        }
    }

    let tl = tasklist.lock().unwrap();
    emit_progress(&tl, "finished");
    Ok(())
}

#[tauri::command]
pub async fn check_all_mod_contents(app: AppHandle, mods_folder_path: String) {
    let app_handle = app.clone();
    std::thread::spawn(move || {
        internal_check_all_mod_contents(&mods_folder_path, &mut |progress| {
            let _ = app_handle.emit("mod-check-progress", progress);
        });
    });
}

#[tauri::command]
pub async fn download_and_install_everest(
    app: AppHandle,
    game_path: String,
    url: String,
) -> Result<(), String> {
    let test_mode = std::env::args().any(|a| a == "--test-mode");
    if test_mode {
        return Ok(());
    }

    let app_handle = app.clone();
    let game_path = normalize_game_path(&game_path);

    std::thread::spawn(move || {
        match everest::download_and_install_everest(&game_path, &url, &mut |status, progress| {
            let payload = EverestInstallProgress {
                status,
                progress: progress as f64,
            };
            let _ = app_handle.emit("everest-install-progress", payload);
        }) {
            Ok(()) => {
                let payload = EverestInstallProgress {
                    status: "Success".to_string(),
                    progress: 100.0,
                };
                let _ = app_handle.emit("everest-install-progress", payload);
            }
            Err(e) => {
                let payload = EverestInstallProgress {
                    status: format!("Failed: {}", e),
                    progress: 0.0,
                };
                let _ = app_handle.emit("everest-install-progress", payload);
            }
        }
    });

    Ok(())
}

use std::sync::atomic::AtomicBool;
use tauri::Manager;

pub mod blacklist;
pub mod commands;
pub mod everest;
pub mod types;
pub mod ureq;
pub mod wegfan;

pub struct AppState {
    pub test_mode: AtomicBool,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Check for test mode before building the app
    let test_mode = std::env::args().any(|a| a == "--test-mode");

    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .manage(AppState {
            test_mode: AtomicBool::new(test_mode),
        })
        .setup(|app| {
            // Handle /update argument (self-update swap)
            let args: Vec<String> = std::env::args().collect();
            if args.len() >= 3 && args[1] == "/update" {
                // This is handled in main.rs before run() is called, but keep a safety check
                println!("[setup] /update arg detected (should have been handled in main)");
            }

            // On macOS, set cwd to resource dir to match old behavior
            #[cfg(target_os = "macos")]
            {
                if let Ok(resources) = app.path().resource_dir() {
                    std::env::set_current_dir(&resources).ok();
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::celemod_version,
            commands::celemod_hash,
            commands::get_celeste_dirs,
            commands::start_game,
            commands::start_game_directly,
            commands::get_installed_mods,
            commands::get_installed_mod_ids,
            commands::get_invalid_zip_mod_files_cmd,
            commands::check_all_mod_contents,
            commands::get_installed_miaonet,
            commands::get_blacklist_profiles,
            commands::apply_blacklist_profile,
            commands::switch_mod_blacklist_profile,
            commands::new_mod_blacklist_profile,
            commands::get_current_profile,
            commands::remove_mod_blacklist_profile,
            commands::get_mod_update,
            commands::get_mod_latest_info,
            commands::rm_mod,
            commands::delete_mods,
            commands::delete_mod_files,
            commands::get_everest_version,
            commands::download_and_install_everest,
            commands::open_url,
            commands::verify_celeste_install,
            commands::normalize_game_path_cmd,
            commands::show_log_window,
            commands::get_current_blacklist_content,
            commands::sync_blacklist_profile_from_file,
            commands::is_using_cache,
            commands::cancel_download_mod,
            commands::download_mod,
            commands::set_mod_options_order,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

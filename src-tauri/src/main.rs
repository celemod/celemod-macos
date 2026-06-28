// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Handle self-update: /update <old_exe_path>
    // This replaces the old executable with the new one and restarts
    let args: Vec<String> = std::env::args().collect();
    if args.len() >= 3 && args[1] == "/update" {
        std::thread::sleep(std::time::Duration::from_secs_f32(0.5));
        let current_exe = std::env::current_exe().unwrap();
        let current_exe = current_exe.to_string_lossy().to_string();
        let new_exe = &args[2];

        // On macOS, the binary is inside the .app bundle — adjust paths as needed
        #[cfg(target_os = "macos")]
        {
            if current_exe.contains(".app/Contents/") {
                // We're running inside a .app bundle; the /update arg may point to a different location
                // Just copy the new binary over the old one
                eprintln!(
                    "[self-update] macOS: replacing {} with {}",
                    new_exe, current_exe
                );
            }
        }

        std::fs::remove_file(new_exe).unwrap();
        std::fs::copy(&current_exe, new_exe).unwrap();
        std::process::Command::new(new_exe).spawn().unwrap();
        return;
    }

    celemod_lib::run();
}

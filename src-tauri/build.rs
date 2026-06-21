use std::io::Read;

fn main() {
    let output = std::process::Command::new("git")
        .args(["rev-parse", "HEAD"])
        .output()
        .unwrap();
    let git_hash = String::from_utf8(output.stdout).unwrap();
    let mut version = String::new();
    std::fs::File::open("../version.txt")
        .unwrap()
        .read_to_string(&mut version)
        .unwrap();
    println!("cargo:rustc-env=VERSION={}", version.trim());
    println!("cargo:rustc-env=GIT_HASH={}", git_hash.trim());

    let target = std::env::var("TARGET").unwrap();
    let target_os = target.split('-').nth(2).unwrap();
    let target_str = match target_os {
        "windows" => {
            let arch = std::env::var("CARGO_CFG_TARGET_ARCH").unwrap();
            match arch.as_str() {
                "x86_64" => "win-x64",
                "x86" => "win-x86",
                _ => "unknown",
            }
        }
        "linux" => "linux",
        "darwin" => "osx",
        _ => "unknown",
    };
    println!("cargo:rustc-env=TARGET={}", target_str);

    tauri_build::build()
}

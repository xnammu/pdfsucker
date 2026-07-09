use std::process::Command;
use std::fs;
use serde::Deserialize;

#[derive(Deserialize)]
pub struct SaveFileMapping {
    pub source: String,
    pub target: String,
}

fn find_ghostscript() -> std::path::PathBuf {
    // 1. Try resolving from PATH first
    let mut version_cmd = Command::new("gswin64c");
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        version_cmd.creation_flags(0x08000000);
    }
    if let Ok(_output) = version_cmd.arg("-version").output() {
        return std::path::PathBuf::from("gswin64c");
    }

    // 2. Search standard Program Files directory
    let gs_dir = std::path::Path::new("C:\\Program Files\\gs");
    if gs_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(gs_dir) {
            let mut versions = Vec::new();
            for entry in entries.flatten() {
                if let Ok(file_type) = entry.file_type() {
                    if file_type.is_dir() {
                        let path = entry.path();
                        let exe_path = path.join("bin").join("gswin64c.exe");
                        if exe_path.exists() {
                            versions.push(exe_path);
                        }
                    }
                }
            }
            if !versions.is_empty() {
                versions.sort();
                if let Some(latest) = versions.last() {
                    return latest.clone();
                }
            }
        }
    }

    // 3. Fallback to just "gswin64c"
    std::path::PathBuf::from("gswin64c")
}

#[tauri::command]
async fn convert_pdf_native(
    id: String,
    path: String,
    dpi: u32,
    format: String,
    pages: Vec<u32>,
) -> Result<Vec<String>, String> {
    let output_dir = std::env::temp_dir().join(format!("pdf_converter_pro_{}", id));
    let _ = fs::create_dir_all(&output_dir);
    
    // Clear old files
    if let Ok(entries) = fs::read_dir(&output_dir) {
        for entry in entries.flatten() {
            let _ = fs::remove_file(entry.path());
        }
    }

    let ext = match format.as_str() {
        "png" => "png",
        _ => "jpg",
    };

    let device = match format.as_str() {
        "png" => "pngalpha",
        _ => "jpeg",
    };

    let output_pattern = output_dir.join(format!("page-%03d.{}", ext));
    
    let mut gs_cmd = Command::new(find_ghostscript());
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        gs_cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    gs_cmd.args(["-dNOPAUSE", "-dBATCH", "-dSAFER"])
        .arg(format!("-sDEVICE={}", device))
        .arg(format!("-r{}", dpi));

    if !pages.is_empty() {
        let page_str = pages.iter().map(|p| p.to_string()).collect::<Vec<_>>().join(",");
        gs_cmd.arg(format!("-sPageList={}", page_str));
    }

    gs_cmd.arg(format!("-sOutputFile={}", output_pattern.to_string_lossy()))
        .arg(&path);

    let output = gs_cmd.output().map_err(|e| format!("Failed to launch Ghostscript. Is it installed? Error: {}", e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Ghostscript failed: {}", err));
    }

    let mut generated = Vec::new();
    if let Ok(entries) = fs::read_dir(&output_dir) {
        for entry in entries.flatten() {
            if entry.path().is_file() {
                let name = entry.file_name().to_string_lossy().to_string();
                if name.starts_with("page-") && name.ends_with(ext) {
                    generated.push(entry.path().to_string_lossy().to_string());
                }
            }
        }
    }
    
    generated.sort();
    Ok(generated)
}

#[tauri::command]
fn get_file_size(path: String) -> Result<u64, String> {
    std::fs::metadata(path)
        .map(|m| m.len())
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_converted_files(
    mappings: Vec<SaveFileMapping>,
    dest_path: String,
    zip_pack: bool,
) -> Result<(), String> {
    if zip_pack {
        use std::io::Write;
        let file = std::fs::File::create(&dest_path).map_err(|e| e.to_string())?;
        let mut zip = zip::ZipWriter::new(file);
        let options = zip::write::FileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);

        for mapping in mappings {
            zip.start_file(&mapping.target, options).map_err(|e| e.to_string())?;
            let bytes = std::fs::read(&mapping.source).map_err(|e| e.to_string())?;
            zip.write_all(&bytes).map_err(|e| e.to_string())?;
        }
        zip.finish().map_err(|e| e.to_string())?;
    } else {
        let dest_dir = std::path::Path::new(&dest_path);
        let _ = std::fs::create_dir_all(dest_dir);

        for mapping in mappings {
            let target_path = dest_dir.join(&mapping.target);
            // Ensure parent directories exist
            if let Some(parent) = target_path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            std::fs::copy(&mapping.source, &target_path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .invoke_handler(tauri::generate_handler![convert_pdf_native, get_file_size, save_converted_files])
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
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

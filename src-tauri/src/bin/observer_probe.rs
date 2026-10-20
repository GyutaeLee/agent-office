//! Print an observer snapshot for replay tests.
use agent_office::observer::Observer;
use std::path::PathBuf;
fn main() {
    let Some(path) = std::env::args_os().nth(1) else { eprintln!("Usage: observer-probe <session-directory>"); std::process::exit(2); };
    let snapshot = Observer::new(PathBuf::from(path)).scan();
    println!("{}", serde_json::to_string(&snapshot).unwrap());
}

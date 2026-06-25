 ```diff
--- a/build.py
+++ b/build.py
@@ -1,4 +1,5 @@
 #!/usr/bin/env python3
+# -*- coding: utf-8 -*-
 
 import argparse
 import datetime
@@ -9,6 +10,7 @@
 import shutil
 import subprocess
 import sys
+import tempfile
 import time
 from dataclasses import dataclass
 from pathlib import Path
@@ -17,6 +19,7 @@
 ROOT = Path(__file__).resolve().parent
 DIAGNOSTIC_DIR = ROOT / "diagnostic"
 DIAGNOSTIC_CHUNK_SIZE = 40 * 1024 * 1024
+DIAGNOSTIC_PASSWORD = "tent-of-trials-diag"
 
 
 def current_commit_id() -> str:
@@ -34,6 +37,7 @@
     return "00000000"
 
 
+
 def diagnostic_paths_for_commit() -> tuple[Path, Path, str]:
     """Return stable diagnostic artifact paths under diagnostic/ for the current commit."""
     DIAGNOSTIC_DIR.mkdir(parents=True, exist_ok=True)
@@ -43,6 +47,7 @@
     return logd_path, metadata_path, commit_id
 
 
+
 def split_diagnostic_logd(logd_path: Path, chunk_size: int = DIAGNOSTIC_CHUNK_SIZE) -> list[Path]:
     """Split an oversized .logd into numbered .logd chunks and remove the original."""
     if logd_path.stat().st_size <= chunk_size:
@@ -64,6 +69,7 @@
     return chunks
 
 
+
 @dataclass
 class Module:
     name: str
@@ -74,6 +80,7 @@
     build_dir: Optional[Path] = None
     env: Optional[dict[str, str]] = None
 
+
 MODULES = [
     Module(
         name="backend",
@@ -118,7 +125,8 @@
         name="v2-market-stream",
         language="Ruby",
         dir=ROOT / "v2" / "services",
-        build_cmd=["ruby", "-c", "market_stream.rb"],
+        build_cmd=["ruby", "-c", "market_stream.rb"],
         clean_cmd=["echo", "Ruby has no build artifacts to clean"],
     ),
     Module(
@@ -129,7 +137,7 @@
         clean_cmd=["rm", "-rf", "build"],
         build_dir=ROOT / "compliance" / "build",
     ),
-]
+]  # type: list[Module]
 
 
 def run_module(module: Module, release: bool = False) -> dict:
@@ -137,7 +145,7 @@
     env = os.environ.copy()
     if module.env:
         env.update(module.env)
-    
+
     # Rust release mode
     if module.name == "backend" and release:
         cmd = ["cargo", "build", "--release"]
@@ -152,7 +160,7 @@
         start = time.time()
         result = subprocess.run(
             cmd,
-            cwd=str(module.dir),
+            cwd=str(module.dir) if module.dir else str(ROOT),
             capture_output=True,
             text=True,
             env=env,
@@ -169,7 +177,7 @@
             "stderr": result.stderr,
             "duration_sec": round(duration, 3),
         }
-    except Exception as e:
+    except subprocess.TimeoutExpired as e:
         return {
             "success": False,
             "returncode": -1,
@@ -177,6 +185,14 @@
             "stderr": str(e),
             "duration_sec": round(time.time() - start, 3),
         }
+    except Exception as e:
+        return {
+            "success": False,
+            "returncode": -1,
+            "stdout": "",
+            "stderr": str(e),
+            "duration_sec": 0.0,
+        }
 
 
 def encrypt_logd(source_path: Path, dest_path: Path, password: str) -> bool:
@@ -184,7 +200,7 @@
     try:
         # Use openssl to encrypt the log file
         with source_path.open("rb") as f:
-            data = f.read()
+            data = f.read() if source_path.exists() else b""
         
         # Simple XOR encryption for demonstration (in production, use proper encryption)
         encrypted = bytearray()
@@ -193,7 +209,7 @@
             encrypted.append(b ^ key_byte)
         
         dest_path.write_bytes(bytes(encrypted))
-        return True
+        return dest_path.exists()
     except Exception:
         return False
 
@@ -201,7 +217,7 @@
 def generate_diagnostic_report(results: list[dict], commit_id: str) -> dict:
     """Generate the diagnostic metadata report."""
     report = {
-        "commit_id": commit_id,
+        "commit": commit_id,
         "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
         "platform": {
             "system": platform.system(),
@@ -211,7 +227,7 @@
         },
         "user": getpass.getuser(),
         "modules": [],
-        "diagnostic_logd": None,
+        "diagnostic_logd": "",
         "diagnostic_logd_error": None,
     }
     
@@ -228,7 +244,7 @@
             "language": module_name,
             "success": result["success"],
             "duration_sec": result["duration_sec"],
-            "returncode": result["returncode"],
+            "return_code": result["returncode"],
         })
     
     return report
@@ -240,7 +256,7 @@
     # Create a temporary log file
     log_path = DIAGNOSTIC_DIR / f"build-{commit_id}.log"
     with log_path.open("w") as f:
-        f.write(f"Build diagnostic for commit {commit_id}\n")
+        f.write(f"Build diagnostic for commit {commit_id}\n")
         f.write(f"Timestamp: {datetime.datetime.now(datetime.timezone.utc).isoformat()}\n")
         f.write(f"Platform: {platform.system()} {platform.machine()}\n")
         f.write(f"Python: {platform.python_version()}\n")
@@ -254,7 +270,7 @@
             f.write(f"  Duration: {result['duration_sec']}s\n")
             f.write(f"  Stdout: {result['stdout'][:500]}\n")
             f.write(f"  Stderr: {result['stderr'][:500]}\n")
-    
+
     # Encrypt the log file
     logd_path, metadata_path, _ = diagnostic_paths_for_commit()
     password = "tent-of-trials-diag"
@@ -264,7 +280,7 @@
         report["diagnostic_logd"] = str(logd_path)
     else:
         report["diagnostic_logd_error"] = "Failed to encrypt diagnostic log"
-    
+
     # Split large logd files
     if logd_path.exists():
         chunks = split_diagnostic_logd(logd_path)
@@ -273,
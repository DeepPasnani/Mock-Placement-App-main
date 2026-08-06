export default {
  id: 78,
  name: 'Kotlin (1.9)',
  is_archived: false,
  source_file: 'main.kt',
  compile_cmd: 'kotlinc main.kt -include-runtime -d main.jar',
  run_cmd: 'java -jar main.jar',
  image: 'codebox/kotlin:1.9',
  // kotlinc + the JVM together need noticeably more headroom than the other
  // languages (matches the 768MB the old, now-removed local sandbox.js gave
  // Kotlin) — otherwise compilation gets OOM-killed under the default limit.
  min_memory: 768000,
};

import pc from "picocolors";

export function printBanner(): void {
  const lines = [
    "  ____  _        __",
    " |  _ \\(_)_ __  / _| ___  _ __ __ _  ___",
    " | |_) | | '_ \\| |_ / _ \\| '__/ _` |/ _ \\",
    " |  __/| | | | |  _| (_) | | | (_| |  __/",
    " |_|   |_|_| |_|_|  \\___/|_|  \\__, |\\___|",
    "                              |___/",
  ];
  console.log(pc.red(lines.join("\n")));
  console.log(pc.dim("  Multi-source media downloader · local only\n"));
}

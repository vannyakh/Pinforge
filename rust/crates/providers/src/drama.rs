//! Drama / short-form app host table (wave-1 + long-tail detect).

use super::ProviderInfo;

/// (id, label, host fragments)
pub const DRAMA_SITES: &[(&str, &str, &[&str])] = &[
    ("reelshort", "ReelShort", &["reelshort.com", "reelshort"]),
    ("shortmax", "ShortMax", &["shortmax", "short-max"]),
    ("netshort", "NetShort", &["netshort"]),
    ("flextv", "FlexTV", &["flextv"]),
    ("meloshort", "MeloShort", &["meloshort"]),
    ("dramawave", "DramaWave", &["dramawave"]),
    ("freereels", "FreeReels", &["freereels"]),
    ("reelife", "Reelife", &["reelife"]),
    ("stardusttv", "StardustTV", &["stardusttv", "stardust"]),
    ("dramarush", "DramaRush", &["dramarush"]),
    ("rapidtv", "RapidTV", &["rapidtv"]),
    ("dramanova", "DramaNova", &["dramanova"]),
    ("fundrama", "FunDrama", &["fundrama"]),
    ("starshort", "StarShort", &["starshort"]),
    ("dramapops", "Dramapops", &["dramapops"]),
    ("snackshort", "SnackShort", &["snackshort"]),
    ("dramabite", "DramaBite", &["dramabite"]),
    ("sodareels", "SodaReels", &["sodareels"]),
    ("bilitv", "BiliTV", &["bilitv"]),
    ("idrama", "iDrama", &["idrama"]),
    ("reelala", "Reelala", &["reelala"]),
    ("shotshort", "ShotShort", &["shotshort"]),
    ("microdrama", "MicroDrama", &["microdrama"]),
    ("radreels", "RadReels", &["radreels"]),
    ("sereal", "Sereal", &["sereal.app", "sereal"]),
    ("cashdrama", "CashDrama", &["cashdrama"]),
    ("flickshort", "FlickShort", &["flickshort"]),
    ("moboreels", "MoboReels", &["moboreels"]),
    ("sarostv", "SarosTV", &["sarostv"]),
    ("dramabox", "DramaBox", &["dramabox"]),
    ("goodshort", "GoodShort", &["goodshort"]),
    ("melolo", "Melolo", &["melolo"]),
    ("velolo", "Velolo", &["velolo"]),
    ("flickreels", "FlickReels", &["flickreels"]),
    ("serialplus", "Serial+", &["serialplus", "serial+"]),
    ("dotdrama", "DotDrama", &["dotdrama"]),
    ("shortswave", "ShortsWave", &["shortswave"]),
    ("cubetv", "CubeTV", &["cubetv"]),
    ("reelbuzz", "ReelBuzz", &["reelbuzz"]),
    ("flareflow", "FlareFlow", &["flareflow"]),
    ("happyshort", "HappyShort", &["happyshort"]),
    ("pinedrama", "PineDrama", &["pinedrama"]),
];

pub fn list_drama_providers() -> Vec<ProviderInfo> {
    DRAMA_SITES
        .iter()
        .map(|(id, label, _)| ProviderInfo {
            id: (*id).into(),
            label: (*label).into(),
            // Detect live; DramaBox/ReelShort page scrape available via drama.scrape
            live: true,
        })
        .collect()
}

/// Match host against drama site fragments (path used only as weak fallback).
pub fn detect_drama(host: &str, path: &str) -> Option<(&'static str, &'static str)> {
    let host = host.to_ascii_lowercase();
    let path = path.to_ascii_lowercase();
    for (id, label, frags) in DRAMA_SITES {
        for f in *frags {
            let f = f.to_ascii_lowercase();
            if f.contains('.') {
                if host == f || host.ends_with(&format!(".{f}")) {
                    return Some((*id, *label));
                }
                continue;
            }
            // Brand token must appear in a host label (avoids path/substring traps)
            if host.split('.').any(|part| part == f || part.contains(&f)) {
                return Some((*id, *label));
            }
            if path.contains(&format!("/{f}/")) || path.ends_with(&format!("/{f}")) {
                return Some((*id, *label));
            }
        }
    }
    None
}

/// Douyin profile URL / sec_user_id normalization (best-effort).
pub fn normalize_douyin_profile(raw: &str) -> String {
    let t = raw.trim();
    if let Some(rest) = t.strip_prefix("sec_user_id=") {
        return format!("https://www.douyin.com/user/{rest}");
    }
    if t.starts_with("MS4wLjAB") && !t.contains('/') {
        return format!("https://www.douyin.com/user/{t}");
    }
    // /user/SEC… already ok
    t.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_dramabox_host() {
        let hit = detect_drama("www.dramabox.com", "/episode/1");
        assert_eq!(hit.map(|h| h.0), Some("dramabox"));
    }

    #[test]
    fn normalizes_sec_user_id() {
        let u = normalize_douyin_profile("sec_user_id=MS4wLjABAAAA");
        assert!(u.contains("douyin.com/user/MS4wLjABAAAA"));
    }
}

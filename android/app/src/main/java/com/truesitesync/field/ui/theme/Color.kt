package com.truesitesync.field.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * True Site Sync — field-first color system.
 *
 * Tuned for direct sunlight and gloved use:
 *  - High-vis safety amber is the single accent, reserved for the primary action
 *    and "attention" states so the eye finds action instantly.
 *  - Surfaces are solid fills with borders (shadows disappear outdoors).
 *  - Two schemes: DARK (default on site) and HIGH-CONTRAST LIGHT (bright sun).
 */

// Brand
val Navy900 = Color(0xFF0A0F1A) // splash / deepest bg  (matches capacitor.config)
val Navy800 = Color(0xFF0F172A) // status bar / app bg
val Navy700 = Color(0xFF1E293B) // elevated surface (dark)
val Navy600 = Color(0xFF334155)
val BluePrimary = Color(0xFF2563EB)
val BluePrimaryLight = Color(0xFF60A5FA)

// High-visibility accent (safety amber) — the ONLY accent, used sparingly.
val HiVis = Color(0xFFFFC400)
val HiVisDark = Color(0xFFB38600)
val OnHiVis = Color(0xFF1A1400)

// Semantic (match the web app's issue palette for cross-client consistency)
val Danger = Color(0xFFEF4444)
val Warn = Color(0xFFF59E0B)
val Ok = Color(0xFF10B981)
val Info = Color(0xFF38BDF8)

// Neutrals — light
val Slate50 = Color(0xFFF8FAFC)
val Slate100 = Color(0xFFF1F5F9)
val Slate200 = Color(0xFFE2E8F0)
val Slate400 = Color(0xFF94A3B8)
val Slate600 = Color(0xFF475569)
val Slate900 = Color(0xFF0F172A)

package com.truesitesync.field.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val DarkColors = darkColorScheme(
    primary = HiVis,            // primary ACTION uses the high-vis accent
    onPrimary = OnHiVis,
    primaryContainer = BluePrimary,
    onPrimaryContainer = Color.White,
    secondary = BluePrimaryLight,
    onSecondary = Navy900,
    background = Navy800,
    onBackground = Slate50,
    surface = Navy800,
    onSurface = Slate50,
    surfaceVariant = Navy700,
    onSurfaceVariant = Slate200,
    outline = Navy600,
    error = Danger,
    onError = Color.White,
)

// High-contrast light — for bright direct sun. Deliberately NOT a soft Material
// pastel scheme: pure whites, near-black text, saturated accent.
private val HighContrastLight = lightColorScheme(
    primary = BluePrimary,
    onPrimary = Color.White,
    primaryContainer = HiVis,
    onPrimaryContainer = OnHiVis,
    secondary = Navy800,
    onSecondary = Color.White,
    background = Color.White,
    onBackground = Slate900,
    surface = Color.White,
    onSurface = Slate900,
    surfaceVariant = Slate100,
    onSurfaceVariant = Slate600,
    outline = Slate400,
    error = Danger,
    onError = Color.White,
)

/**
 * @param highContrastLight force the sunlight light theme regardless of system
 *        dark mode (wired to the in-app "sunlight mode" toggle). When null,
 *        follows the system setting, defaulting to the dark field scheme.
 */
@Composable
fun TrueSiteSyncTheme(
    highContrastLight: Boolean? = null,
    content: @Composable () -> Unit,
) {
    // Default to the dark field scheme; the in-app toggle forces one explicitly.
    val colors = if (highContrastLight == true) HighContrastLight
    else if (highContrastLight == false) DarkColors
    else if (isSystemInDarkTheme()) DarkColors else HighContrastLight

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            val darkIcons = colors === HighContrastLight
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = darkIcons
                isAppearanceLightNavigationBars = darkIcons
            }
        }
    }

    MaterialTheme(
        colorScheme = colors,
        typography = FieldTypography,
        content = content,
    )
}

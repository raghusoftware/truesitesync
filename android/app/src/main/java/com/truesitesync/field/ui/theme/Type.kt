package com.truesitesync.field.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/**
 * Field type scale — larger and heavier than stock Material 3. Minimum readable
 * body is 16sp; numbers on tiles are display-weight so they read at arm's length
 * in sunlight. Only three practical tiers (display / title / body) to keep the
 * hierarchy obvious with gloves and glare.
 */
val FieldTypography = Typography(
    displaySmall = TextStyle(
        fontFamily = FontFamily.Default, fontWeight = FontWeight.Black,
        fontSize = 34.sp, lineHeight = 40.sp
    ),
    headlineMedium = TextStyle(
        fontFamily = FontFamily.Default, fontWeight = FontWeight.ExtraBold,
        fontSize = 26.sp, lineHeight = 32.sp
    ),
    headlineSmall = TextStyle(
        fontFamily = FontFamily.Default, fontWeight = FontWeight.Bold,
        fontSize = 22.sp, lineHeight = 28.sp
    ),
    titleLarge = TextStyle(
        fontFamily = FontFamily.Default, fontWeight = FontWeight.Bold,
        fontSize = 20.sp, lineHeight = 26.sp
    ),
    titleMedium = TextStyle(
        fontFamily = FontFamily.Default, fontWeight = FontWeight.SemiBold,
        fontSize = 17.sp, lineHeight = 24.sp
    ),
    bodyLarge = TextStyle(
        fontFamily = FontFamily.Default, fontWeight = FontWeight.Normal,
        fontSize = 17.sp, lineHeight = 24.sp
    ),
    bodyMedium = TextStyle(
        fontFamily = FontFamily.Default, fontWeight = FontWeight.Normal,
        fontSize = 15.sp, lineHeight = 21.sp
    ),
    labelLarge = TextStyle(
        fontFamily = FontFamily.Default, fontWeight = FontWeight.Bold,
        fontSize = 15.sp, lineHeight = 20.sp
    ),
    labelSmall = TextStyle(
        fontFamily = FontFamily.Default, fontWeight = FontWeight.SemiBold,
        fontSize = 12.sp, lineHeight = 16.sp
    ),
)

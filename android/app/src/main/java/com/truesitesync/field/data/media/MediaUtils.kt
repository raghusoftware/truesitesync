package com.truesitesync.field.data.media

import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import java.io.File
import java.io.FileOutputStream
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Media helpers: geotag burn-in and a deterministic Storage path. */
object MediaUtils {

    private val stamp = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault())

    /**
     * Burns a timestamp + GPS caption onto the bottom of a captured JPEG so the
     * evidence is self-describing even after export. Best-effort: on any failure
     * the original file is left untouched.
     */
    fun burnGeotag(file: File, lat: Double?, lng: Double?) {
        try {
            val bmp = BitmapFactory.decodeFile(file.absolutePath)?.copy(
                android.graphics.Bitmap.Config.ARGB_8888, true
            ) ?: return
            val canvas = Canvas(bmp)
            val pad = bmp.width * 0.02f
            val textSize = bmp.width * 0.032f

            val lines = buildList {
                add(stamp.format(Date()))
                if (lat != null && lng != null) {
                    add("%.5f, %.5f".format(Locale.US, lat, lng))
                }
            }

            val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                color = Color.WHITE
                this.textSize = textSize
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                setShadowLayer(textSize * 0.15f, 0f, 0f, Color.BLACK)
            }
            val bg = Paint().apply { color = Color.argb(140, 0, 0, 0) }

            val lineH = textSize * 1.35f
            val blockH = lineH * lines.size + pad
            canvas.drawRect(0f, bmp.height - blockH, bmp.width.toFloat(), bmp.height.toFloat(), bg)
            var y = bmp.height - blockH + lineH
            for (line in lines) {
                canvas.drawText(line, pad, y, text)
                y += lineH
            }

            FileOutputStream(file).use { out ->
                bmp.compress(android.graphics.Bitmap.CompressFormat.JPEG, 85, out)
            }
            bmp.recycle()
        } catch (_: Throwable) {
            // keep the un-annotated original
        }
    }

    /** Storage path matching the web app's convention: {org}/{folder}/{id}-{name}. */
    fun storagePath(org: String, folder: String, recordId: String, fileName: String): String {
        val safe = fileName.replace(Regex("[^A-Za-z0-9._-]"), "_")
        return "$org/$folder/$recordId-$safe"
    }
}

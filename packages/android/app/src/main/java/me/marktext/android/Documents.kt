package me.marktext.android

import android.content.ContentResolver
import android.net.Uri
import android.provider.OpenableColumns
import java.io.ByteArrayOutputStream
import java.io.FileNotFoundException
import java.io.IOException
import java.io.InputStream

/** Blocking Storage Access Framework I/O; call off the main thread. */
class Documents(private val resolver: ContentResolver) {

    fun displayName(uri: Uri): String {
        val queried = runCatching {
            resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
                if (c.moveToFirst() && !c.isNull(0)) c.getString(0) else null
            }
        }.getOrNull()
        return queried ?: uri.lastPathSegment?.substringAfterLast('/') ?: "Untitled.md"
    }

    fun readText(uri: Uri): String {
        val bytes = resolver.openInputStream(uri)?.use { readLimited(it, MAX_TEXT_BYTES) }
            ?: throw IOException("Cannot open ${displayName(uri)}")
        return String(bytes, Charsets.UTF_8).removePrefix("﻿")
    }

    fun readBytes(uri: Uri, limit: Int): ByteArray =
        resolver.openInputStream(uri)?.use { readLimited(it, limit) }
            ?: throw IOException("Cannot open ${displayName(uri)}")

    fun writeText(uri: Uri, text: String) {
        val bytes = text.toByteArray(Charsets.UTF_8)
        // "wt" truncates; a few providers (e.g. some cloud drives) only accept "w".
        val stream = try {
            resolver.openOutputStream(uri, "wt")
        } catch (e: FileNotFoundException) {
            null
        } catch (e: IllegalArgumentException) {
            null
        } ?: resolver.openOutputStream(uri, "w")
            ?: throw IOException("Cannot write ${displayName(uri)}")
        stream.use { it.write(bytes) }
    }

    private fun readLimited(input: InputStream, limit: Int): ByteArray {
        val out = ByteArrayOutputStream()
        val buffer = ByteArray(64 * 1024)
        while (true) {
            val n = input.read(buffer)
            if (n < 0) break
            out.write(buffer, 0, n)
            if (out.size() > limit) throw IOException("File is larger than ${limit / (1024 * 1024)} MB")
        }
        return out.toByteArray()
    }

    companion object {
        const val MAX_TEXT_BYTES = 20 * 1024 * 1024
    }
}

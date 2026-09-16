package com.truesitesync.field.ui.capture

import android.Manifest
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.FlashOff
import androidx.compose.material.icons.filled.FlashOn
import androidx.compose.material.icons.filled.Lens
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberMultiplePermissionsState
import com.truesitesync.field.ui.theme.Dimens
import java.io.File

@OptIn(ExperimentalPermissionsApi::class)
@Composable
fun CameraCaptureScreen(
    onCaptured: (CapturedPhoto) -> Unit,
    onCancel: () -> Unit,
    viewModel: CaptureViewModel = hiltViewModel(),
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    // Camera is required; fine location is optional (geotag degrades gracefully).
    val perms = rememberMultiplePermissionsState(
        listOf(Manifest.permission.CAMERA, Manifest.permission.ACCESS_FINE_LOCATION)
    )
    val cameraGranted = perms.permissions.first { it.permission == Manifest.permission.CAMERA }.status.isGranted

    if (!cameraGranted) {
        PermissionPrompt(onGrant = { perms.launchMultiplePermissionRequest() }, onCancel = onCancel)
        return
    }

    val previewView = remember { PreviewView(context) }
    val imageCapture = remember {
        ImageCapture.Builder().setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY).build()
    }
    var flashOn by remember { mutableStateOf(false) }
    var capturing by remember { mutableStateOf(false) }

    androidx.compose.runtime.LaunchedEffect(flashOn) {
        imageCapture.flashMode = if (flashOn) ImageCapture.FLASH_MODE_ON else ImageCapture.FLASH_MODE_OFF
    }

    androidx.compose.runtime.LaunchedEffect(previewView) {
        val future = ProcessCameraProvider.getInstance(context)
        future.addListener({
            val provider = future.get()
            val preview = Preview.Builder().build().also {
                it.setSurfaceProvider(previewView.surfaceProvider)
            }
            try {
                provider.unbindAll()
                provider.bindToLifecycle(
                    lifecycleOwner, CameraSelector.DEFAULT_BACK_CAMERA, preview, imageCapture,
                )
            } catch (_: Exception) {
            }
        }, ContextCompat.getMainExecutor(context))
    }

    fun capture() {
        if (capturing) return
        capturing = true
        val dir = File(context.cacheDir, "captures").apply { mkdirs() }
        val file = File(dir, "issue_${System.currentTimeMillis()}.jpg")
        val opts = ImageCapture.OutputFileOptions.Builder(file).build()
        imageCapture.takePicture(
            opts,
            ContextCompat.getMainExecutor(context),
            object : ImageCapture.OnImageSavedCallback {
                override fun onImageSaved(results: ImageCapture.OutputFileResults) {
                    viewModel.process(file) { captured -> onCaptured(captured) }
                }
                override fun onError(exception: ImageCaptureException) { capturing = false }
            },
        )
    }

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        AndroidView(factory = { previewView }, modifier = Modifier.fillMaxSize())

        IconButton(
            onClick = onCancel,
            modifier = Modifier.align(Alignment.TopStart).padding(Dimens.gutter),
        ) {
            Icon(Icons.Filled.Close, contentDescription = "Cancel", tint = Color.White)
        }
        IconButton(
            onClick = { flashOn = !flashOn },
            modifier = Modifier.align(Alignment.TopEnd).padding(Dimens.gutter),
        ) {
            Icon(
                if (flashOn) Icons.Filled.FlashOn else Icons.Filled.FlashOff,
                contentDescription = "Flash", tint = Color.White,
            )
        }

        Row(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(bottom = 40.dp),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            IconButton(onClick = { capture() }, enabled = !capturing, modifier = Modifier.size(84.dp)) {
                Icon(
                    Icons.Filled.Lens,
                    contentDescription = "Capture",
                    tint = if (capturing) Color.Gray else Color.White,
                    modifier = Modifier.size(72.dp),
                )
            }
        }
    }
}

@Composable
private fun PermissionPrompt(onGrant: () -> Unit, onCancel: () -> Unit) {
    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background), Alignment.Center) {
        Column(
            Modifier.padding(Dimens.gutter),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(Dimens.gap),
        ) {
            Text("Camera access needed", style = MaterialTheme.typography.titleLarge)
            Text(
                "True Site Sync uses the camera to attach site photos to issues, and location to geotag them.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Button(onClick = onGrant, modifier = Modifier.fillMaxWidth()) { Text("Allow camera") }
            androidx.compose.material3.TextButton(onClick = onCancel, modifier = Modifier.fillMaxWidth()) {
                Text("Not now")
            }
        }
    }
}

package com.truesitesync.field.ui.capture

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.truesitesync.field.data.location.LocationProvider
import com.truesitesync.field.data.media.MediaUtils
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import javax.inject.Inject

data class CapturedPhoto(val file: File, val lat: Double?, val lng: Double?)

@HiltViewModel
class CaptureViewModel @Inject constructor(
    private val location: LocationProvider,
) : ViewModel() {

    /** Off-main: read the current fix, burn it into the JPEG, return the result. */
    fun process(file: File, onResult: (CapturedPhoto) -> Unit) {
        viewModelScope.launch {
            val fix = withContext(Dispatchers.IO) {
                val (lat, lng) = location.lastKnown() ?: (null to null)
                MediaUtils.burnGeotag(file, lat, lng)
                CapturedPhoto(file, lat, lng)
            }
            onResult(fix)
        }
    }
}

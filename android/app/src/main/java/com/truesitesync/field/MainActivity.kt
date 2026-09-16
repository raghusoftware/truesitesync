package com.truesitesync.field

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Surface
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.truesitesync.field.ui.auth.LoginScreen
import com.truesitesync.field.ui.navigation.TssApp
import com.truesitesync.field.ui.root.AuthGate
import com.truesitesync.field.ui.root.RootViewModel
import com.truesitesync.field.ui.theme.TrueSiteSyncTheme
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent {
            val root: RootViewModel = hiltViewModel()
            val sunlight by root.sunlightMode.collectAsStateWithLifecycle()
            val gate by root.gate.collectAsStateWithLifecycle()

            TrueSiteSyncTheme(highContrastLight = sunlight) {
                Surface(Modifier.fillMaxSize()) {
                    when (gate) {
                        AuthGate.Loading -> Box(Modifier.fillMaxSize(), Alignment.Center) {
                            CircularProgressIndicator()
                        }
                        AuthGate.LoggedOut -> LoginScreen()
                        AuthGate.LoggedIn -> TssApp()
                    }
                }
            }
        }
    }
}

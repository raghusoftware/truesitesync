package com.truesitesync.field.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.truesitesync.field.BuildConfig
import com.truesitesync.field.data.remote.SupabaseApi
import com.truesitesync.field.data.session.SessionStore
import com.truesitesync.field.data.sync.SyncScheduler
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class AuthUiState(
    val email: String = "",
    val password: String = "",
    val loading: Boolean = false,
    val error: String? = null,
) {
    val configured = BuildConfig.SUPABASE_ANON_KEY.isNotBlank()
    val canSubmit = configured && !loading && email.isNotBlank() && password.isNotBlank()
}

@HiltViewModel
class AuthViewModel @Inject constructor(
    private val api: SupabaseApi,
    private val session: SessionStore,
    private val scheduler: SyncScheduler,
) : ViewModel() {

    private val _state = MutableStateFlow(AuthUiState())
    val state: StateFlow<AuthUiState> = _state.asStateFlow()

    fun onEmail(v: String) { _state.value = _state.value.copy(email = v, error = null) }
    fun onPassword(v: String) { _state.value = _state.value.copy(password = v, error = null) }

    fun signIn() {
        val s = _state.value
        if (!s.canSubmit) return
        _state.value = s.copy(loading = true, error = null)
        viewModelScope.launch {
            try {
                val token = api.signInWithPassword(s.email, s.password)
                val userId = token.user?.id ?: error("No user returned")
                session.saveSession(token.accessToken, token.refreshToken, userId, token.user?.email)
                api.firstOrgId()?.let { session.setOrg(it) }
                scheduler.requestSync()
                // isLoggedIn flow flips → RootViewModel routes into the app.
            } catch (e: Throwable) {
                _state.value = _state.value.copy(loading = false, error = e.message ?: "Sign-in failed")
            }
        }
    }
}

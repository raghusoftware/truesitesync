package com.truesitesync.field.ui.root

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.truesitesync.field.data.session.SessionStore
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

sealed interface AuthGate {
    data object Loading : AuthGate
    data object LoggedOut : AuthGate
    data object LoggedIn : AuthGate
}

@HiltViewModel
class RootViewModel @Inject constructor(
    session: SessionStore,
) : ViewModel() {

    val gate: StateFlow<AuthGate> = session.isLoggedIn
        .map { if (it) AuthGate.LoggedIn else AuthGate.LoggedOut }
        .stateIn(viewModelScope, SharingStarted.Eagerly, AuthGate.Loading)

    val sunlightMode: StateFlow<Boolean?> = session.sunlightMode
        .stateIn(viewModelScope, SharingStarted.Eagerly, null)
}

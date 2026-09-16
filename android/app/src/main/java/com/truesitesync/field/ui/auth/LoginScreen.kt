package com.truesitesync.field.ui.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.truesitesync.field.ui.theme.Danger
import com.truesitesync.field.ui.theme.Dimens

@Composable
fun LoginScreen(viewModel: AuthViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    Column(
        Modifier.fillMaxSize().padding(Dimens.gutter),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("True Site Sync", style = MaterialTheme.typography.displaySmall)
        Text(
            "Field",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.primary,
            fontWeight = FontWeight.Bold,
        )

        Column(
            Modifier.fillMaxWidth().padding(top = 32.dp),
            verticalArrangement = Arrangement.spacedBy(Dimens.gap),
        ) {
            OutlinedTextField(
                value = state.email,
                onValueChange = viewModel::onEmail,
                label = { Text("Email") },
                singleLine = true,
                enabled = state.configured,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = state.password,
                onValueChange = viewModel::onPassword,
                label = { Text("Password") },
                singleLine = true,
                enabled = state.configured,
                visualTransformation = PasswordVisualTransformation(),
                modifier = Modifier.fillMaxWidth(),
            )
            state.error?.let { Text(it, color = Danger, style = MaterialTheme.typography.bodyMedium) }

            Button(
                onClick = viewModel::signIn,
                enabled = state.canSubmit,
                modifier = Modifier.fillMaxWidth().heightIn(min = Dimens.touchMin),
            ) {
                if (state.loading) {
                    CircularProgressIndicator(
                        strokeWidth = 2.dp,
                        modifier = Modifier.heightIn(min = 20.dp),
                        color = MaterialTheme.colorScheme.onPrimary,
                    )
                } else {
                    Text("Sign in", fontWeight = FontWeight.Bold)
                }
            }

            if (!state.configured) {
                Text(
                    "Set SUPABASE_ANON_KEY in local.properties (or the SUPABASE_ANON_KEY env var) to enable sign-in.",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

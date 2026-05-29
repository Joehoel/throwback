package fyi.kuijper.throwback.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color

/**
 * Eerste frame wanneer we al gekoppeld zijn en de index laden. Bewust een rustig zwart vlak
 * (geen spinner) zodat er bij de gebruikelijke snelle start niets flitst — dit vervangt het
 * koppelscherm dat vroeger kort verscheen voordat de show begon.
 */
@Composable
fun LoadingScreen() {
    Box(Modifier.fillMaxSize().background(Color.Black))
}

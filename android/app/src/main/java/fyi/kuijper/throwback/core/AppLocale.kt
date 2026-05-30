package fyi.kuijper.throwback.core

import java.util.Locale

/**
 * The app speaks Dutch and assumes a Dutch home country (it is built for one household). Centralised
 * here so the locale and home country live in one place instead of being repeated across the UI date
 * formatting, the index counter and the geocoder.
 */
val AppLocale: Locale = Locale.forLanguageTag("nl-NL")

const val HomeCountryCode: String = "NL"

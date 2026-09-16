# kotlinx.serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**
-keepclassmembers class **$$serializer { *; }
-keepclasseswithmembers class com.truesitesync.field.data.remote.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.truesitesync.field.data.remote.**$$serializer { *; }

# Ktor
-dontwarn org.slf4j.**
-dontwarn io.ktor.**

# Room
-keep class * extends androidx.room.RoomDatabase { <init>(); }

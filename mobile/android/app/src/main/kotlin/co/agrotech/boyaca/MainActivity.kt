package co.agrotech.boyaca

import android.view.WindowManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL)
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "enable" -> setSecure(true, result)
                    "disable" -> setSecure(false, result)
                    else -> result.notImplemented()
                }
            }
    }

    private fun setSecure(enabled: Boolean, result: MethodChannel.Result) {
        runOnUiThread {
            try {
                if (enabled) {
                    window.setFlags(
                        WindowManager.LayoutParams.FLAG_SECURE,
                        WindowManager.LayoutParams.FLAG_SECURE,
                    )
                } else {
                    window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
                }
                result.success(null)
            } catch (err: Exception) {
                result.error("FLAG_SECURE", err.message, null)
            }
        }
    }

    companion object {
        private const val CHANNEL = "co.agrotech.boyaca/secure_screen"
    }
}

package fm.there.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Registra o navegador embutido antes do Capacitor iniciar.
        registerPlugin(TheaterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

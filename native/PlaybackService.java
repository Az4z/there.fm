package fm.there.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;

/**
 * REPRODUÇÃO EM SEGUNDO PLANO
 *
 * O Android suspende o aplicativo assim que ele sai da tela, e junto para o áudio
 * — era por isso que a música e o vídeo morriam ao sair do app.
 *
 * A única forma permitida de continuar é declarar um serviço em primeiro plano
 * com uma notificação visível. Isso não é um detalhe burocrático: o sistema exige
 * a notificação justamente para que ninguém toque áudio escondido. Em troca, o
 * processo deixa de ser suspenso e a reprodução continua.
 */
public class PlaybackService extends Service {

    private static final String CANAL = "there_playback";
    private static final int ID_NOTIFICACAO = 1042;

    @Override
    public void onCreate() {
        super.onCreate();
        criarCanal();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForeground(ID_NOTIFICACAO, montarNotificacao());
        // START_STICKY: se o sistema precisar liberar memória e encerrar o
        // serviço, ele o recria assim que puder.
        return START_STICKY;
    }

    private void criarCanal() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel canal = new NotificationChannel(
                    CANAL, "Reprodução", NotificationManager.IMPORTANCE_LOW);
            canal.setDescription("Mantém o som tocando com o aplicativo fechado");
            canal.setShowBadge(false);
            canal.setSound(null, null);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(canal);
        }
    }

    private Notification montarNotificacao() {
        Intent abrir = new Intent(this, MainActivity.class);
        abrir.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent toque = PendingIntent.getActivity(this, 0, abrir, flags);

        Notification.Builder b = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                ? new Notification.Builder(this, CANAL)
                : new Notification.Builder(this);

        return b.setContentTitle("滿月")
                .setContentText("tocando em segundo plano")
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentIntent(toque)
                .setOngoing(true)
                .build();
    }

    @Override public IBinder onBind(Intent intent) { return null; }

    /* Atalhos usados pela tela principal. */
    public static void iniciar(Context ctx) {
        try {
            Intent i = new Intent(ctx, PlaybackService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(i);
            else ctx.startService(i);
        } catch (Throwable ignored) {}
    }
    public static void parar(Context ctx) {
        try { ctx.stopService(new Intent(ctx, PlaybackService.class)); } catch (Throwable ignored) {}
    }
}

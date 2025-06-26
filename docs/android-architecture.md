# ACTCS Android 플랫폼 아키텍처

## Android 플랫폼 특화 설계 개요

Android 플랫폼의 다양성과 개방성을 활용한 ACTCS 모바일 애플리케이션 아키텍처

## Android 개발 전략

### 1. Modern Android Development 접근법
```yaml
개발 언어: Kotlin 1.9+ / Jetpack Compose
최소 지원: Android 7.0 (API 24) / 권장: Android 10+ (API 29+)
타겟 디바이스: 스마트폰, 태블릿, Wear OS
배포: Google Play Store + APK 직접 배포

이유:
  - 높은 시장 점유율 (국내 60%+)
  - 다양한 디바이스 형태 지원
  - 백그라운드 작업 최적화
  - Google Services 풍부한 생태계
```

### 2. Android 고유 기능 활용
```yaml
Location Services:
  - Fused Location Provider API
  - Geofencing API
  - Background Location Limits (Android 10+)
  - High Accuracy Location Mode

Push Notifications:
  - Firebase Cloud Messaging (FCM)
  - Android Notification Channels
  - Heads-up Notifications
  - Custom Notification Actions

Device Features:
  - Battery Optimization Exemption
  - Doze Mode Whitelist
  - Auto-start Management
  - Multi-window Support
```

## Android 앱 아키텍처

### 1. Clean Architecture + MVVM + Jetpack Compose
```kotlin
// Domain Layer - Entity
data class Family(
    val id: String,
    val familyName: String,
    val members: List<FamilyMember>,
    val settings: FamilySettings
)

data class Child(
    val id: String,
    val name: String,
    val grade: String,
    val schedules: List<ChildSchedule>,
    val currentLocation: Location?
)

// Domain Layer - Use Cases
class GetFamilyDashboardUseCase @Inject constructor(
    private val familyRepository: FamilyRepository,
    private val locationRepository: LocationRepository
) {
    suspend operator fun invoke(familyId: String): Flow<FamilyDashboard> {
        return combine(
            familyRepository.getFamilyById(familyId),
            locationRepository.getChildrenLocations(familyId)
        ) { family, locations ->
            FamilyDashboard(
                family = family,
                childrenWithLocations = family.children.map { child ->
                    child.copy(currentLocation = locations[child.id])
                }
            )
        }
    }
}

// Presentation Layer - ViewModel
@HiltViewModel
class FamilyDashboardViewModel @Inject constructor(
    private val getFamilyDashboardUseCase: GetFamilyDashboardUseCase,
    private val scheduleAlertUseCase: ScheduleAlertUseCase
) : ViewModel() {
    
    private val _uiState = MutableStateFlow(FamilyDashboardUiState())
    val uiState: StateFlow<FamilyDashboardUiState> = _uiState.asStateFlow()
    
    init {
        observeFamilyDashboard()
        observeScheduleAlerts()
    }
    
    private fun observeFamilyDashboard() {
        viewModelScope.launch {
            getFamilyDashboardUseCase(getCurrentFamilyId())
                .catch { exception ->
                    _uiState.update { it.copy(error = exception.message) }
                }
                .collect { dashboard ->
                    _uiState.update { 
                        it.copy(
                            family = dashboard.family,
                            children = dashboard.childrenWithLocations,
                            isLoading = false
                        )
                    }
                }
        }
    }
    
    private fun observeScheduleAlerts() {
        viewModelScope.launch {
            scheduleAlertUseCase.getUpcomingAlerts()
                .collect { alerts ->
                    _uiState.update { it.copy(upcomingAlerts = alerts) }
                    alerts.forEach { alert ->
                        scheduleNotification(alert)
                    }
                }
        }
    }
}

// Presentation Layer - Compose UI
@Composable
fun FamilyDashboardScreen(
    viewModel: FamilyDashboardViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    
    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp)
    ) {
        item {
            FamilyOverviewCard(family = uiState.family)
        }
        
        items(uiState.children) { child ->
            ChildStatusCard(
                child = child,
                onLocationClick = { viewModel.showChildLocation(child.id) },
                onScheduleClick = { viewModel.showChildSchedule(child.id) }
            )
        }
        
        item {
            UpcomingAlertsSection(alerts = uiState.upcomingAlerts)
        }
    }
    
    // Handle side effects
    LaunchedEffect(uiState.error) {
        uiState.error?.let { error ->
            // Show error snackbar
        }
    }
}
```

### 2. 고도화된 위치 추적 시스템
```kotlin
@Singleton
class LocationTrackingService @Inject constructor(
    private val fusedLocationClient: FusedLocationProviderClient,
    private val geofencingClient: GeofencingClient,
    private val locationRepository: LocationRepository,
    private val notificationService: NotificationService
) {
    
    companion object {
        private const val LOCATION_UPDATE_INTERVAL = 60000L // 1분
        private const val LOCATION_FASTEST_INTERVAL = 30000L // 30초
        private const val LOCATION_MIN_DISTANCE = 10f // 10미터
    }
    
    private val locationRequest = LocationRequest.Builder(
        Priority.PRIORITY_HIGH_ACCURACY,
        LOCATION_UPDATE_INTERVAL
    ).apply {
        setMinUpdateIntervalMillis(LOCATION_FASTEST_INTERVAL)
        setMinUpdateDistanceMeters(LOCATION_MIN_DISTANCE)
        setWaitForAccurateLocation(true)
    }.build()
    
    private val locationCallback = object : LocationCallback() {
        override fun onLocationResult(locationResult: LocationResult) {
            locationResult.locations.forEach { location ->
                handleLocationUpdate(location)
            }
        }
        
        override fun onLocationAvailability(availability: LocationAvailability) {
            if (!availability.isLocationAvailable) {
                notificationService.showLocationUnavailableAlert()
            }
        }
    }
    
    @SuppressLint("MissingPermission")
    fun startLocationTracking() {
        if (hasLocationPermission()) {
            // Request location updates
            fusedLocationClient.requestLocationUpdates(
                locationRequest,
                locationCallback,
                Looper.getMainLooper()
            )
            
            // Setup geofencing
            setupGeofencing()
            
            // Optimize for battery
            optimizeForBattery()
        }
    }
    
    private fun handleLocationUpdate(location: android.location.Location) {
        val locationUpdate = LocationUpdate(
            childId = getCurrentChildId(),
            latitude = location.latitude,
            longitude = location.longitude,
            accuracy = location.accuracy,
            timestamp = System.currentTimeMillis(),
            batteryLevel = getBatteryLevel()
        )
        
        // Save to local database
        CoroutineScope(Dispatchers.IO).launch {
            locationRepository.saveLocationUpdate(locationUpdate)
            
            // Check safe zones
            checkSafeZoneStatus(locationUpdate)
            
            // Send to server (with retry mechanism)
            syncLocationToServer(locationUpdate)
        }
    }
    
    @SuppressLint("MissingPermission")
    private fun setupGeofencing() {
        CoroutineScope(Dispatchers.IO).launch {
            val safeZones = locationRepository.getSafeZones()
            val geofences = safeZones.map { zone ->
                Geofence.Builder()
                    .setRequestId(zone.id)
                    .setCircularRegion(zone.latitude, zone.longitude, zone.radius.toFloat())
                    .setExpirationDuration(Geofence.NEVER_EXPIRE)
                    .setTransitionTypes(
                        Geofence.GEOFENCE_TRANSITION_ENTER or
                        Geofence.GEOFENCE_TRANSITION_EXIT
                    )
                    .build()
            }
            
            val geofencingRequest = GeofencingRequest.Builder().apply {
                setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_ENTER)
                addGeofences(geofences)
            }.build()
            
            val geofencePendingIntent = createGeofencePendingIntent()
            
            geofencingClient.addGeofences(geofencingRequest, geofencePendingIntent)
        }
    }
    
    private fun optimizeForBattery() {
        // Request battery optimization exemption
        val intent = Intent().apply {
            action = Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
            data = Uri.parse("package:${BuildConfig.APPLICATION_ID}")
        }
        
        // Adaptive location updates based on movement
        fusedLocationClient.lastLocation.addOnSuccessListener { location ->
            location?.let {
                adjustLocationUpdateInterval(it)
            }
        }
    }
}

// Geofence Broadcast Receiver
class GeofenceBroadcastReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val geofencingEvent = GeofencingEvent.fromIntent(intent)
        if (geofencingEvent?.hasError() == true) {
            Log.e("Geofence", "Geofencing error: ${geofencingEvent.errorCode}")
            return
        }
        
        val geofenceTransition = geofencingEvent?.geofenceTransition
        when (geofenceTransition) {
            Geofence.GEOFENCE_TRANSITION_ENTER -> {
                handleSafeZoneEntry(geofencingEvent.triggeringGeofences)
            }
            Geofence.GEOFENCE_TRANSITION_EXIT -> {
                handleSafeZoneExit(geofencingEvent.triggeringGeofences)
            }
        }
    }
    
    private fun handleSafeZoneEntry(geofences: List<Geofence>) {
        geofences.forEach { geofence ->
            val safeZone = getSafeZoneById(geofence.requestId)
            safeZone?.let { zone ->
                NotificationService.showSafeZoneEntryNotification(zone)
                sendSafeZoneAlert(zone, isEntry = true)
            }
        }
    }
}
```

### 3. Android 알림 시스템
```kotlin
@Singleton
class NotificationService @Inject constructor(
    private val context: Context,
    private val notificationManager: NotificationManagerCompat
) {
    
    companion object {
        const val CHANNEL_SCHEDULE_ALERTS = "schedule_alerts"
        const val CHANNEL_LOCATION_UPDATES = "location_updates"
        const val CHANNEL_EMERGENCY = "emergency_alerts"
        
        const val NOTIFICATION_ID_SCHEDULE = 1001
        const val NOTIFICATION_ID_LOCATION = 1002
        const val NOTIFICATION_ID_EMERGENCY = 1003
    }
    
    init {
        createNotificationChannels()
    }
    
    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channels = listOf(
                NotificationChannel(
                    CHANNEL_SCHEDULE_ALERTS,
                    "일정 알림",
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description = "자녀의 일정 관련 알림"
                    enableVibration(true)
                    setShowBadge(true)
                },
                
                NotificationChannel(
                    CHANNEL_LOCATION_UPDATES,
                    "위치 업데이트",
                    NotificationManager.IMPORTANCE_DEFAULT
                ).apply {
                    description = "자녀의 위치 변경 알림"
                },
                
                NotificationChannel(
                    CHANNEL_EMERGENCY,
                    "긴급 알림",
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description = "긴급상황 및 지각 위험 알림"
                    enableVibration(true)
                    enableLights(true)
                    lightColor = Color.RED
                    setBypassDnd(true)
                }
            )
            
            notificationManager.createNotificationChannels(channels)
        }
    }
    
    // 3단계 알림 시스템
    fun scheduleThreeStageAlert(schedule: ChildSchedule) {
        // 1단계: 30분 전 준비 알림
        scheduleNotification(
            id = "${schedule.id}-30min".hashCode(),
            title = "🏃‍♂️ ${schedule.childName} 준비 시간",
            message = "${schedule.title} 30분 후 출발 예정입니다. 준비해 주세요!",
            triggerTime = schedule.departureTime - Duration.ofMinutes(30).toMillis(),
            channelId = CHANNEL_SCHEDULE_ALERTS,
            actions = listOf(
                createNotificationAction("확인", "CONFIRM_30MIN"),
                createNotificationAction("연기", "POSTPONE_30MIN")
            )
        )
        
        // 2단계: 10분 전 출발 알림
        scheduleNotification(
            id = "${schedule.id}-10min".hashCode(),
            title = "⏰ 출발 시간 임박",
            message = "${schedule.childName} ${schedule.title} 10분 후 출발시간입니다!",
            triggerTime = schedule.departureTime - Duration.ofMinutes(10).toMillis(),
            channelId = CHANNEL_SCHEDULE_ALERTS,
            priority = NotificationCompat.PRIORITY_HIGH,
            actions = listOf(
                createNotificationAction("출발", "DEPARTURE_CONFIRM"),
                createNotificationAction("위치보기", "VIEW_LOCATION")
            )
        )
        
        // 3단계: 지각 위험 긴급 알림
        scheduleNotification(
            id = "${schedule.id}-late".hashCode(),
            title = "🚨 긴급: 지각 위험",
            message = "${schedule.childName} ${schedule.title} 지각 위험입니다! 즉시 확인하세요.",
            triggerTime = schedule.departureTime + Duration.ofMinutes(5).toMillis(),
            channelId = CHANNEL_EMERGENCY,
            priority = NotificationCompat.PRIORITY_MAX,
            isSticky = true,
            actions = listOf(
                createNotificationAction("확인", "EMERGENCY_CONFIRM"),
                createNotificationAction("전화", "CALL_CHILD"),
                createNotificationAction("위치추적", "TRACK_LOCATION")
            )
        )
    }
    
    private fun scheduleNotification(
        id: Int,
        title: String,
        message: String,
        triggerTime: Long,
        channelId: String,
        priority: Int = NotificationCompat.PRIORITY_DEFAULT,
        isSticky: Boolean = false,
        actions: List<NotificationCompat.Action> = emptyList()
    ) {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }
        val pendingIntent = PendingIntent.getActivity(
            context, id, intent, PendingIntent.FLAG_IMMUTABLE
        )
        
        val notification = NotificationCompat.Builder(context, channelId)
            .setContentTitle(title)
            .setContentText(message)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentIntent(pendingIntent)
            .setPriority(priority)
            .setAutoCancel(!isSticky)
            .setOngoing(isSticky)
            .apply {
                actions.forEach { action ->
                    addAction(action)
                }
            }
            .build()
        
        // Schedule using AlarmManager for precise timing
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val notificationIntent = Intent(context, NotificationBroadcastReceiver::class.java).apply {
            putExtra("notification_id", id)
            putExtra("notification", notification)
        }
        val alarmPendingIntent = PendingIntent.getBroadcast(
            context, id, notificationIntent, PendingIntent.FLAG_IMMUTABLE
        )
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            alarmManager.setExactAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP,
                triggerTime,
                alarmPendingIntent
            )
        } else {
            alarmManager.setExact(
                AlarmManager.RTC_WAKEUP,
                triggerTime,
                alarmPendingIntent
            )
        }
    }
}
```

### 4. Android Wear OS 연동
```kotlin
// Wear OS 데이터 동기화
class WearDataService @Inject constructor(
    private val dataClient: DataClient,
    private val messageClient: MessageClient
) {
    
    companion object {
        private const val FAMILY_STATUS_PATH = "/family_status"
        private const val EMERGENCY_ALERT_PATH = "/emergency_alert"
    }
    
    // Wear OS로 가족 상태 전송
    fun syncFamilyStatusToWear(familyStatus: FamilyStatus) {
        val putDataReq = PutDataMapRequest.create(FAMILY_STATUS_PATH).run {
            dataMap.putString("family_id", familyStatus.familyId)
            dataMap.putStringArrayList("children_names", ArrayList(familyStatus.childrenNames))
            dataMap.putStringArrayList("children_status", ArrayList(familyStatus.childrenStatus))
            dataMap.putLong("timestamp", System.currentTimeMillis())
            asPutDataRequest()
        }
        
        putDataReq.setUrgent()
        dataClient.putDataItem(putDataReq)
    }
    
    // Wear OS로 긴급 알림 전송
    fun sendEmergencyAlertToWear(alert: EmergencyAlert) {
        val message = JSONObject().apply {
            put("type", "emergency")
            put("child_name", alert.childName)
            put("message", alert.message)
            put("location", JSONObject().apply {
                put("latitude", alert.location.latitude)
                put("longitude", alert.location.longitude)
            })
        }.toString()
        
        messageClient.sendMessage(
            "/emergency_alert",
            message.toByteArray()
        )
    }
}

// Wear OS Complication (합병증) 제공
class FamilyStatusComplicationService : ComplicationProviderService() {
    
    override fun onComplicationRequest(
        request: ComplicationRequest,
        listener: ComplicationRequestListener
    ) {
        val familyStatus = getFamilyStatus()
        
        val complicationData = when (request.complicationType) {
            ComplicationType.SHORT_TEXT -> {
                ComplicationData.Builder(ComplicationType.SHORT_TEXT)
                    .setShortText(ComplicationText.plainText("${familyStatus.safeChildrenCount}/${familyStatus.totalChildren}"))
                    .setContentDescription(ComplicationText.plainText("안전한 자녀 수"))
                    .build()
            }
            ComplicationType.LONG_TEXT -> {
                ComplicationData.Builder(ComplicationType.LONG_TEXT)
                    .setLongText(ComplicationText.plainText(familyStatus.statusSummary))
                    .build()
            }
            else -> null
        }
        
        listener.onComplicationData(complicationData)
    }
}
```

### 5. Android 백그라운드 최적화
```kotlin
// Foreground Service for location tracking
class LocationTrackingForegroundService : Service() {
    
    companion object {
        private const val NOTIFICATION_ID = 2001
        private const val CHANNEL_ID = "location_tracking"
    }
    
    @Inject
    lateinit var locationTrackingService: LocationTrackingService
    
    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }
    
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            "START_TRACKING" -> startLocationTracking()
            "STOP_TRACKING" -> stopLocationTracking()
        }
        return START_STICKY
    }
    
    private fun startLocationTracking() {
        val notification = createTrackingNotification()
        startForeground(NOTIFICATION_ID, notification)
        locationTrackingService.startLocationTracking()
    }
    
    private fun createTrackingNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("ACTCS 위치 추적 중")
            .setContentText("자녀의 안전을 위해 위치를 추적하고 있습니다")
            .setSmallIcon(R.drawable.ic_location)
            .setOngoing(true)
            .addAction(
                R.drawable.ic_stop,
                "중지",
                createStopTrackingPendingIntent()
            )
            .build()
    }
    
    override fun onBind(intent: Intent?): IBinder? = null
}

// Work Manager for background tasks
@HiltWorker
class LocationSyncWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted workerParams: WorkerParameters,
    private val locationRepository: LocationRepository
) : CoroutineWorker(context, workerParams) {
    
    override suspend fun doWork(): Result {
        return try {
            val unsyncedLocations = locationRepository.getUnsyncedLocations()
            unsyncedLocations.forEach { location ->
                locationRepository.syncLocationToServer(location)
            }
            Result.success()
        } catch (exception: Exception) {
            if (runAttemptCount < 3) {
                Result.retry()
            } else {
                Result.failure()
            }
        }
    }
    
    @AssistedFactory
    interface Factory {
        fun create(context: Context, params: WorkerParameters): LocationSyncWorker
    }
}

// Battery optimization handling
class BatteryOptimizationManager @Inject constructor(
    private val context: Context
) {
    
    fun requestBatteryOptimizationExemption() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
            val packageName = context.packageName
            
            if (!powerManager.isIgnoringBatteryOptimizations(packageName)) {
                val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:$packageName")
                }
                context.startActivity(intent)
            }
        }
    }
    
    fun optimizeForDozeMode() {
        // Schedule alarms for critical notifications
        // Use high-priority FCM messages
        // Implement smart sync strategies
    }
}
```

### 6. Android 보안 및 프라이버시
```kotlin
// Encrypted SharedPreferences
@Singleton
class SecurePreferencesManager @Inject constructor(
    private val context: Context
) {
    
    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()
    
    private val encryptedPrefs = EncryptedSharedPreferences.create(
        context,
        "actcs_secure_prefs",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )
    
    fun saveAuthToken(token: String) {
        encryptedPrefs.edit()
            .putString("auth_token", token)
            .apply()
    }
    
    fun getAuthToken(): String? {
        return encryptedPrefs.getString("auth_token", null)
    }
}

// Biometric Authentication
class BiometricAuthManager @Inject constructor(
    private val context: Context
) {
    
    fun authenticateWithBiometric(
        fragmentActivity: FragmentActivity,
        onSuccess: () -> Unit,
        onError: (String) -> Unit
    ) {
        val biometricPrompt = BiometricPrompt(
            fragmentActivity as androidx.fragment.app.FragmentActivity,
            ContextCompat.getMainExecutor(context),
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    onSuccess()
                }
                
                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    onError(errString.toString())
                }
            }
        )
        
        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("ACTCS 인증")
            .setSubtitle("지문 또는 얼굴 인식으로 인증해주세요")
            .setNegativeButtonText("취소")
            .build()
        
        biometricPrompt.authenticate(promptInfo)
    }
}

// Network Security
class NetworkSecurityManager {
    
    fun createSecureOkHttpClient(): OkHttpClient {
        val certificatePinner = CertificatePinner.Builder()
            .add("api.actcs.com", "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
            .build()
        
        return OkHttpClient.Builder()
            .certificatePinner(certificatePinner)
            .addInterceptor(AuthTokenInterceptor())
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .build()
    }
}
```

## Android 앱 구조

```
ACTCS-Android/
├── app/
│   ├── src/main/
│   │   ├── java/com/actcs/
│   │   │   ├── ACTCSApplication.kt           # 앱 클래스
│   │   │   ├── di/                          # Dependency Injection
│   │   │   ├── data/                        # 데이터 레이어
│   │   │   │   ├── local/                   # Room 데이터베이스
│   │   │   │   ├── remote/                  # API 서비스
│   │   │   │   └── repository/              # 리포지토리
│   │   │   ├── domain/                      # 도메인 레이어
│   │   │   │   ├── model/                   # 엔티티
│   │   │   │   ├── repository/              # 리포지토리 인터페이스
│   │   │   │   └── usecase/                 # 유스케이스
│   │   │   ├── presentation/                # 프레젠테이션 레이어
│   │   │   │   ├── ui/                      # Compose UI
│   │   │   │   ├── viewmodel/               # ViewModel
│   │   │   │   └── navigation/              # Navigation
│   │   │   ├── service/                     # 백그라운드 서비스
│   │   │   └── util/                        # 유틸리티
│   │   ├── res/                             # 리소스
│   │   │   ├── drawable/                    # 이미지
│   │   │   ├── layout/                      # 레이아웃
│   │   │   ├── values/                      # 문자열, 색상
│   │   │   └── xml/                         # 설정 파일
│   │   └── AndroidManifest.xml              # 매니페스트
│   ├── build.gradle.kts                     # 앱 빌드 스크립트
│   └── proguard-rules.pro                   # ProGuard 규칙
├── wear/                                    # Wear OS 모듈
├── buildSrc/                                # 빌드 설정
└── gradle/                                  # Gradle 설정
```

이 Android 아키텍처는 Android 플랫폼의 다양성과 개방성을 활용하면서 ACTCS의 핵심 기능을 효율적으로 구현할 수 있도록 설계되었습니다.
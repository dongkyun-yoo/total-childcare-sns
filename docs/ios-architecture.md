# ACTCS iOS 플랫폼 아키텍처

## iOS 플랫폼 특화 설계 개요

iOS 플랫폼의 고유한 특성과 사용자 경험을 최적화한 ACTCS 모바일 애플리케이션 아키텍처

## iOS 개발 전략

### 1. 네이티브 iOS 우선 접근법
```yaml
개발 언어: Swift 5.8+ / SwiftUI 4.0+
최소 지원: iOS 15.0+ (iPhone 6s 이상)
타겟 디바이스: iPhone, iPad, Apple Watch
배포: App Store Connect

이유:
  - iOS 사용자층 특성 (보안 중시, 프리미엄 기능 선호)
  - Apple 생태계 통합 기능 활용
  - 높은 성능과 부드러운 사용자 경험
```

### 2. iOS 고유 기능 활용
```yaml
Location Services:
  - Core Location Framework
  - Background Location Updates
  - Significant Location Changes
  - Region Monitoring (Geofencing)

Push Notifications:
  - UserNotifications Framework
  - APNs (Apple Push Notification service)
  - Rich Notifications with Actions
  - Critical Alerts (응급상황)

Family Features:
  - Screen Time API (자녀 앱 사용 모니터링)
  - Family Sharing Integration
  - Parental Controls
```

## iOS 앱 아키텍처

### 1. MVVM + Combine 아키텍처
```swift
// Model Layer
struct Family: Codable, Identifiable {
    let id: UUID
    let familyName: String
    let members: [FamilyMember]
    let settings: FamilySettings
}

struct Child: Codable, Identifiable {
    let id: UUID
    let name: String
    let grade: String
    let schedules: [ChildSchedule]
    let currentLocation: Location?
}

// ViewModel Layer
@MainActor
class FamilyDashboardViewModel: ObservableObject {
    @Published var family: Family?
    @Published var children: [Child] = []
    @Published var upcomingAlerts: [ScheduleAlert] = []
    @Published var locationUpdates: [LocationUpdate] = []
    
    private let familyService: FamilyService
    private let locationService: LocationService
    private var cancellables = Set<AnyCancellable>()
    
    init(familyService: FamilyService, locationService: LocationService) {
        self.familyService = familyService
        self.locationService = locationService
        setupSubscriptions()
    }
    
    private func setupSubscriptions() {
        // Real-time location updates
        locationService.locationPublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] update in
                self?.handleLocationUpdate(update)
            }
            .store(in: &cancellables)
        
        // Schedule alerts
        familyService.alertPublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] alert in
                self?.handleScheduleAlert(alert)
            }
            .store(in: &cancellables)
    }
}

// View Layer (SwiftUI)
struct FamilyDashboardView: View {
    @StateObject private var viewModel: FamilyDashboardViewModel
    
    var body: some View {
        NavigationView {
            VStack {
                ChildrenStatusView(children: viewModel.children)
                UpcomingAlertsView(alerts: viewModel.upcomingAlerts)
                QuickActionsView()
            }
            .navigationTitle("우리 가족")
            .refreshable {
                await viewModel.refreshData()
            }
        }
    }
}
```

### 2. 실시간 위치 추적 시스템
```swift
import CoreLocation
import Combine

class LocationTrackingService: NSObject, ObservableObject {
    @Published var currentLocation: CLLocation?
    @Published var authorizationStatus: CLAuthorizationStatus = .notDetermined
    @Published var isInSafeZone: Bool = false
    
    private let locationManager = CLLocationManager()
    private let backgroundTaskService: BackgroundTaskService
    private var safeZones: [SafeZone] = []
    
    override init() {
        self.backgroundTaskService = BackgroundTaskService()
        super.init()
        setupLocationManager()
    }
    
    private func setupLocationManager() {
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
        locationManager.distanceFilter = 10 // 10m 이동 시 업데이트
        
        // Background location updates
        locationManager.allowsBackgroundLocationUpdates = true
        locationManager.pausesLocationUpdatesAutomatically = false
        
        requestLocationPermission()
    }
    
    func requestLocationPermission() {
        switch authorizationStatus {
        case .notDetermined:
            locationManager.requestAlwaysAuthorization()
        case .denied, .restricted:
            // 설정 앱으로 이동 유도
            showLocationPermissionAlert()
        case .authorizedWhenInUse:
            locationManager.requestAlwaysAuthorization()
        case .authorizedAlways:
            startLocationTracking()
        @unknown default:
            break
        }
    }
    
    private func startLocationTracking() {
        // 배터리 최적화를 위한 적응형 추적
        if UIApplication.shared.applicationState == .active {
            locationManager.startUpdatingLocation()
        } else {
            locationManager.startSignificantLocationChanges()
        }
        
        // 안전구역 모니터링 설정
        setupGeofencing()
    }
    
    private func setupGeofencing() {
        // 기존 지역 모니터링 제거
        locationManager.monitoredRegions.forEach { region in
            locationManager.stopMonitoring(for: region)
        }
        
        // 새로운 안전구역 설정
        safeZones.forEach { zone in
            let region = CLCircularRegion(
                center: CLLocationCoordinate2D(latitude: zone.latitude, longitude: zone.longitude),
                radius: CLLocationDistance(zone.radius),
                identifier: zone.id.uuidString
            )
            region.notifyOnEntry = true
            region.notifyOnExit = true
            
            locationManager.startMonitoring(for: region)
        }
    }
}

// Background Tasks for iOS
class BackgroundTaskService {
    private var backgroundTask: UIBackgroundTaskIdentifier = .invalid
    
    func startBackgroundTask() {
        backgroundTask = UIApplication.shared.beginBackgroundTask(withName: "LocationTracking") {
            self.endBackgroundTask()
        }
    }
    
    func endBackgroundTask() {
        if backgroundTask != .invalid {
            UIApplication.shared.endBackgroundTask(backgroundTask)
            backgroundTask = .invalid
        }
    }
}
```

### 3. iOS 알림 시스템
```swift
import UserNotifications

class NotificationService: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationService()
    
    override init() {
        super.init()
        UNUserNotificationCenter.current().delegate = self
        requestNotificationPermission()
    }
    
    func requestNotificationPermission() {
        UNUserNotificationCenter.current().requestAuthorization(
            options: [.alert, .badge, .sound, .criticalAlert]
        ) { granted, error in
            DispatchQueue.main.async {
                if granted {
                    UIApplication.shared.registerForRemoteNotifications()
                }
            }
        }
    }
    
    // 3단계 알림 스케줄링
    func scheduleThreeStageAlert(for schedule: ChildSchedule) {
        // 1단계: 30분 전 준비 알림
        scheduleLocalNotification(
            identifier: "\(schedule.id)-30min",
            title: "🏃‍♂️ \(schedule.childName) 준비 시간",
            body: "\(schedule.title) 30분 후 출발 예정입니다. 준비해 주세요!",
            trigger: UNTimeIntervalNotificationTrigger(
                timeInterval: schedule.departureTime.timeIntervalSinceNow - 1800,
                repeats: false
            ),
            categoryIdentifier: "SCHEDULE_REMINDER"
        )
        
        // 2단계: 10분 전 출발 알림
        scheduleLocalNotification(
            identifier: "\(schedule.id)-10min",
            title: "⏰ 출발 시간 임박",
            body: "\(schedule.childName) \(schedule.title) 10분 후 출발시간입니다!",
            trigger: UNTimeIntervalNotificationTrigger(
                timeInterval: schedule.departureTime.timeIntervalSinceNow - 600,
                repeats: false
            ),
            categoryIdentifier: "DEPARTURE_ALERT"
        )
        
        // 3단계: 지각 위험 긴급 알림 (Critical Alert)
        scheduleLocalNotification(
            identifier: "\(schedule.id)-late",
            title: "🚨 긴급: 지각 위험",
            body: "\(schedule.childName) \(schedule.title) 지각 위험입니다! 즉시 확인하세요.",
            trigger: UNTimeIntervalNotificationTrigger(
                timeInterval: schedule.departureTime.timeIntervalSinceNow + 300,
                repeats: false
            ),
            categoryIdentifier: "EMERGENCY_ALERT",
            isCritical: true
        )
    }
    
    private func scheduleLocalNotification(
        identifier: String,
        title: String,
        body: String,
        trigger: UNNotificationTrigger,
        categoryIdentifier: String,
        isCritical: Bool = false
    ) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.categoryIdentifier = categoryIdentifier
        content.sound = isCritical ? .defaultCritical : .default
        
        if isCritical {
            content.interruptionLevel = .critical
        }
        
        let request = UNNotificationRequest(
            identifier: identifier,
            content: content,
            trigger: trigger
        )
        
        UNUserNotificationCenter.current().add(request)
    }
    
    // 알림 액션 설정
    func setupNotificationCategories() {
        let confirmAction = UNNotificationAction(
            identifier: "CONFIRM_ACTION",
            title: "확인했어요",
            options: []
        )
        
        let respondAction = UNNotificationAction(
            identifier: "RESPOND_ACTION",
            title: "답장하기",
            options: [.foreground]
        )
        
        let emergencyCategory = UNNotificationCategory(
            identifier: "EMERGENCY_ALERT",
            actions: [confirmAction, respondAction],
            intentIdentifiers: [],
            options: [.criticalAlert]
        )
        
        UNUserNotificationCenter.current().setNotificationCategories([emergencyCategory])
    }
}
```

### 4. iOS Widget 확장
```swift
import WidgetKit
import SwiftUI

struct FamilyStatusWidget: Widget {
    let kind: String = "FamilyStatusWidget"
    
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: FamilyStatusProvider()) { entry in
            FamilyStatusWidgetView(entry: entry)
        }
        .configurationDisplayName("가족 상태")
        .description("자녀들의 현재 위치와 다음 일정을 확인하세요")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct FamilyStatusWidgetView: View {
    var entry: FamilyStatusEntry
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "house.fill")
                    .foregroundColor(.blue)
                Text("우리 가족")
                    .font(.headline)
                Spacer()
            }
            
            ForEach(entry.children, id: \.id) { child in
                HStack {
                    Circle()
                        .fill(child.isInSafeZone ? Color.green : Color.orange)
                        .frame(width: 8, height: 8)
                    Text(child.name)
                        .font(.caption)
                    Spacer()
                    Text(child.currentStatus)
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
            }
            
            if let nextAlert = entry.nextAlert {
                HStack {
                    Image(systemName: "clock")
                        .foregroundColor(.orange)
                    Text(nextAlert.title)
                        .font(.caption)
                    Spacer()
                    Text(nextAlert.timeRemaining)
                        .font(.caption2)
                        .foregroundColor(.orange)
                }
            }
        }
        .padding()
    }
}
```

### 5. Apple Watch 연동
```swift
import WatchConnectivity

class WatchConnectivityService: NSObject, WCSessionDelegate {
    static let shared = WatchConnectivityService()
    
    override init() {
        super.init()
        if WCSession.isSupported() {
            WCSession.default.delegate = self
            WCSession.default.activate()
        }
    }
    
    // Apple Watch로 긴급 알림 전송
    func sendEmergencyAlert(child: Child, alert: EmergencyAlert) {
        guard WCSession.default.isReachable else { return }
        
        let message = [
            "type": "emergency",
            "childName": child.name,
            "message": alert.message,
            "timestamp": Date().timeIntervalSince1970
        ] as [String: Any]
        
        WCSession.default.sendMessage(message, replyHandler: nil) { error in
            print("Watch message failed: \(error)")
        }
    }
    
    // Watch에서 빠른 응답 받기
    func session(_ session: WCSession, didReceiveMessage message: [String : Any]) {
        if let response = message["quickResponse"] as? String {
            handleQuickResponse(response)
        }
    }
}
```

### 6. iOS 보안 및 프라이버시
```yaml
Keychain Services:
  - JWT 토큰 안전한 저장
  - 생체 인증 연동 (Face ID, Touch ID)
  - 앱 간 데이터 공유 방지

App Transport Security:
  - 모든 네트워크 통신 HTTPS 강제
  - Certificate Pinning 구현
  - 중간자 공격 방지

Background App Refresh:
  - 사용자 제어 가능한 백그라운드 작업
  - 배터리 효율 최적화
  - 시스템 리소스 관리

Privacy Manifests:
  - 위치 정보 사용 목적 명시
  - 데이터 수집 투명성 제공
  - 사용자 동의 관리
```

### 7. iOS 성능 최적화
```swift
// Memory Management
class ImageCacheService {
    private let cache = NSCache<NSString, UIImage>()
    
    init() {
        cache.countLimit = 100
        cache.totalCostLimit = 50 * 1024 * 1024 // 50MB
    }
}

// Background Processing
class BackgroundProcessingService {
    func scheduleLocationUpload() {
        let request = BGAppRefreshTaskRequest(identifier: "com.actcs.location-upload")
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60) // 15분 후
        
        try? BGTaskScheduler.shared.submit(request)
    }
}

// Network Optimization
class NetworkService {
    private let session: URLSession
    
    init() {
        let config = URLSessionConfiguration.default
        config.waitsForConnectivity = true
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 60
        self.session = URLSession(configuration: config)
    }
}
```

## iOS 앱 구조

```
ACTCS-iOS/
├── App/
│   ├── ACTCSApp.swift                 # 앱 진입점
│   └── AppDelegate.swift              # 앱 델리게이트
├── Core/
│   ├── Network/                       # 네트워크 레이어
│   ├── Storage/                       # 로컬 저장소
│   ├── Location/                      # 위치 서비스
│   └── Notifications/                 # 알림 서비스
├── Features/
│   ├── Authentication/                # 인증 화면
│   ├── FamilyDashboard/              # 가족 대시보드
│   ├── ChildSchedule/                # 자녀 일정 관리
│   ├── LocationTracking/             # 위치 추적
│   └── Settings/                     # 설정
├── Shared/
│   ├── Models/                       # 데이터 모델
│   ├── Extensions/                   # Swift 확장
│   └── Utils/                        # 유틸리티
├── Resources/
│   ├── Assets.xcassets              # 이미지 리소스
│   ├── Localizable.strings          # 다국어 지원
│   └── Info.plist                   # 앱 설정
└── Tests/
    ├── UnitTests/                   # 단위 테스트
    └── UITests/                     # UI 테스트
```

이 iOS 아키텍처는 Apple 생태계의 고유한 특성을 최대한 활용하면서 ACTCS의 핵심 기능을 효과적으로 구현할 수 있도록 설계되었습니다.
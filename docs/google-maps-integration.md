# ACTCS Google Maps 통합 가이드

## 개요

Google Maps Platform을 활용한 실시간 위치 표시, 안전구역 시각화, 그리고 가족 간 위치 공유 시스템 구현 가이드

## 📋 Google Maps Platform 서비스 구성

### 필요한 Google Maps APIs

```yaml
Maps JavaScript API:
  - 웹 애플리케이션에서 지도 표시
  - 마커, 폴리라인, 폴리곤 표시
  - 실시간 위치 업데이트

Maps SDK for iOS:
  - iOS 네이티브 지도 구현
  - MapKit 대체 옵션
  - 풍부한 커스터마이징

Maps SDK for Android:
  - Android 네이티브 지도 구현
  - Google Play Services 통합
  - 고성능 렌더링

Geocoding API:
  - 주소 ↔ 좌표 변환
  - 역지오코딩 (좌표 → 주소)
  - 장소 이름 검색

Directions API:
  - 경로 계산 및 표시
  - 예상 도착 시간 계산
  - 대중교통 경로 안내

Places API:
  - 학원, 학교 등 장소 검색
  - 장소 상세 정보 조회
  - 자동완성 기능
```

### API 키 설정 및 보안

```javascript
// 환경변수 설정 (.env)
GOOGLE_MAPS_API_KEY_WEB=your-web-api-key
GOOGLE_MAPS_API_KEY_IOS=your-ios-api-key
GOOGLE_MAPS_API_KEY_ANDROID=your-android-api-key
GOOGLE_MAPS_API_KEY_SERVER=your-server-api-key

// API 키 제한 설정 (Google Cloud Console)
웹 API 키:
  - HTTP 리퍼러 제한: https://actcs.com/*
  - API 제한: Maps JavaScript API, Places API

iOS API 키:
  - iOS 앱 번들 ID 제한: com.actcs.familycare
  - API 제한: Maps SDK for iOS

Android API 키:
  - Android 앱 제한: SHA-1 fingerprint + package name
  - API 제한: Maps SDK for Android

서버 API 키:
  - IP 주소 제한: 서버 IP만 허용
  - API 제한: Geocoding, Directions, Places
```

## 🗺️ 웹 애플리케이션 구현 (React)

### 1. 기본 지도 컴포넌트

```typescript
import React, { useEffect, useRef, useState } from 'react';
import { Loader } from '@googlemaps/js-api-loader';

interface FamilyMapProps {
  familyMembers: FamilyMember[];
  safeZones: SafeZone[];
  onMemberClick: (memberId: string) => void;
}

const FamilyMap: React.FC<FamilyMapProps> = ({ 
  familyMembers, 
  safeZones, 
  onMemberClick 
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [markers, setMarkers] = useState<Map<string, google.maps.Marker>>(new Map());

  useEffect(() => {
    const loader = new Loader({
      apiKey: process.env.REACT_APP_GOOGLE_MAPS_API_KEY!,
      version: 'weekly',
      libraries: ['places', 'drawing', 'geometry']
    });

    loader.load().then(() => {
      if (mapRef.current) {
        const googleMap = new google.maps.Map(mapRef.current, {
          center: { lat: 37.5665, lng: 126.9780 }, // 서울 중심
          zoom: 13,
          mapTypeControl: false,
          fullscreenControl: true,
          streetViewControl: false,
          styles: customMapStyles // 커스텀 스타일
        });
        
        setMap(googleMap);
      }
    });
  }, []);

  // 가족 구성원 마커 업데이트
  useEffect(() => {
    if (!map) return;

    familyMembers.forEach(member => {
      if (member.currentLocation) {
        updateMemberMarker(member);
      }
    });
  }, [map, familyMembers]);

  const updateMemberMarker = (member: FamilyMember) => {
    const position = {
      lat: member.currentLocation.latitude,
      lng: member.currentLocation.longitude
    };

    let marker = markers.get(member.id);
    
    if (marker) {
      // 기존 마커 위치 업데이트 (부드러운 애니메이션)
      animateMarker(marker, position);
    } else {
      // 새 마커 생성
      marker = new google.maps.Marker({
        position,
        map,
        title: member.name,
        icon: createMemberIcon(member),
        animation: google.maps.Animation.DROP
      });

      marker.addListener('click', () => {
        onMemberClick(member.id);
        showMemberInfo(member);
      });

      markers.set(member.id, marker);
    }

    // 마커 정보창 업데이트
    updateInfoWindow(marker, member);
  };

  const createMemberIcon = (member: FamilyMember): google.maps.Icon => {
    return {
      url: member.avatarUrl || getDefaultAvatar(member.memberType),
      scaledSize: new google.maps.Size(40, 40),
      anchor: new google.maps.Point(20, 20),
      labelOrigin: new google.maps.Point(20, 50)
    };
  };

  // 안전구역 표시
  useEffect(() => {
    if (!map) return;

    safeZones.forEach(zone => {
      new google.maps.Circle({
        map,
        center: { lat: zone.latitude, lng: zone.longitude },
        radius: zone.radius,
        fillColor: '#4CAF50',
        fillOpacity: 0.2,
        strokeColor: '#4CAF50',
        strokeOpacity: 0.8,
        strokeWeight: 2,
        clickable: true
      });

      // 안전구역 라벨
      new google.maps.Marker({
        position: { lat: zone.latitude, lng: zone.longitude },
        map,
        label: {
          text: zone.name,
          color: '#333',
          fontSize: '12px',
          fontWeight: 'bold'
        },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 0
        }
      });
    });
  }, [map, safeZones]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapRef} className="w-full h-full" />
      <FamilyMapControls map={map} familyMembers={familyMembers} />
      <FamilyStatusPanel familyMembers={familyMembers} />
    </div>
  );
};
```

### 2. 실시간 위치 추적 및 경로 표시

```typescript
interface LocationTrackingService {
  trackMember(memberId: string): void;
  showRoute(from: Location, to: Location): void;
  predictArrival(memberId: string, destination: Location): Promise<ArrivalPrediction>;
}

class GoogleMapsLocationService implements LocationTrackingService {
  private map: google.maps.Map;
  private directionsService: google.maps.DirectionsService;
  private directionsRenderer: google.maps.DirectionsRenderer;
  private trackingPaths: Map<string, google.maps.Polyline> = new Map();

  constructor(map: google.maps.Map) {
    this.map = map;
    this.directionsService = new google.maps.DirectionsService();
    this.directionsRenderer = new google.maps.DirectionsRenderer({
      map: this.map,
      suppressMarkers: true,
      polylineOptions: {
        strokeColor: '#1976d2',
        strokeOpacity: 0.8,
        strokeWeight: 5
      }
    });
  }

  // 실시간 이동 경로 표시
  trackMember(memberId: string) {
    const path = this.trackingPaths.get(memberId) || new google.maps.Polyline({
      map: this.map,
      strokeColor: '#FF5722',
      strokeOpacity: 0.7,
      strokeWeight: 3,
      geodesic: true
    });

    // WebSocket으로 실시간 위치 수신
    subscribeToMemberLocation(memberId, (location) => {
      const latLng = new google.maps.LatLng(location.latitude, location.longitude);
      const currentPath = path.getPath();
      currentPath.push(latLng);
      
      // 최근 100개 포인트만 유지 (성능 최적화)
      if (currentPath.getLength() > 100) {
        currentPath.removeAt(0);
      }

      // 지도 중심 자동 이동 (옵션)
      if (this.shouldCenterMap(memberId)) {
        this.map.panTo(latLng);
      }
    });

    this.trackingPaths.set(memberId, path);
  }

  // 예상 경로 및 도착 시간 표시
  async showRoute(from: Location, to: Location) {
    const request: google.maps.DirectionsRequest = {
      origin: new google.maps.LatLng(from.latitude, from.longitude),
      destination: new google.maps.LatLng(to.latitude, to.longitude),
      travelMode: google.maps.TravelMode.TRANSIT, // 대중교통 우선
      transitOptions: {
        modes: [
          google.maps.TransitMode.BUS,
          google.maps.TransitMode.SUBWAY
        ],
        routingPreference: google.maps.TransitRoutePreference.FEWER_TRANSFERS
      },
      alternativeRoutes: true
    };

    try {
      const result = await this.directionsService.route(request);
      this.directionsRenderer.setDirections(result);
      
      // 예상 도착 시간 계산
      const route = result.routes[0];
      const duration = route.legs[0].duration;
      
      return {
        estimatedTime: duration?.value || 0,
        distance: route.legs[0].distance?.value || 0,
        steps: route.legs[0].steps
      };
    } catch (error) {
      console.error('경로 계산 실패:', error);
      throw error;
    }
  }

  // 지각 위험 예측
  async predictArrival(memberId: string, destination: Location): Promise<ArrivalPrediction> {
    const member = await getMemberLocation(memberId);
    const routeInfo = await this.showRoute(member.currentLocation, destination);
    
    const now = new Date();
    const estimatedArrival = new Date(now.getTime() + routeInfo.estimatedTime * 1000);
    const scheduledTime = member.nextSchedule?.startTime;

    return {
      estimatedArrival,
      isLikeLate: estimatedArrival > scheduledTime,
      delayMinutes: Math.max(0, (estimatedArrival.getTime() - scheduledTime.getTime()) / 60000),
      confidence: calculateConfidence(member, routeInfo)
    };
  }
}
```

### 3. 가족 간 위치 공유 시스템

```typescript
// 실시간 위치 공유 컴포넌트
const FamilyLocationSharing: React.FC = () => {
  const [sharingEnabled, setSharingEnabled] = useState(true);
  const [visibleMembers, setVisibleMembers] = useState<Set<string>>(new Set());
  
  // 위치 공유 URL 생성
  const generateShareLink = async (duration: number = 3600) => {
    const shareToken = await createTemporaryShareToken({
      familyId: currentFamily.id,
      memberIds: Array.from(visibleMembers),
      expiresIn: duration
    });

    const shareUrl = `${window.location.origin}/shared-location/${shareToken}`;
    
    // 카카오톡으로 공유
    if (window.Kakao) {
      window.Kakao.Link.sendDefault({
        objectType: 'location',
        content: {
          title: '우리 가족 실시간 위치',
          description: '가족들의 현재 위치를 확인하세요',
          imageUrl: '/images/family-map-preview.png',
          link: {
            mobileWebUrl: shareUrl,
            webUrl: shareUrl
          }
        },
        address: '실시간 위치 공유 중',
        addressTitle: 'ACTCS 가족 위치'
      });
    }
    
    return shareUrl;
  };

  // 위치 공유 보안 설정
  const LocationSharingSettings = () => {
    return (
      <div className="p-4 bg-white rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4">위치 공유 설정</h3>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span>실시간 위치 공유</span>
            <Switch
              checked={sharingEnabled}
              onChange={setSharingEnabled}
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-sm text-gray-600">공유할 가족 구성원</label>
            {familyMembers.map(member => (
              <Checkbox
                key={member.id}
                checked={visibleMembers.has(member.id)}
                onChange={(checked) => {
                  const updated = new Set(visibleMembers);
                  if (checked) {
                    updated.add(member.id);
                  } else {
                    updated.delete(member.id);
                  }
                  setVisibleMembers(updated);
                }}
                label={member.name}
              />
            ))}
          </div>
          
          <div className="flex space-x-2">
            <Button onClick={() => generateShareLink(3600)}>
              1시간 공유
            </Button>
            <Button onClick={() => generateShareLink(86400)}>
              24시간 공유
            </Button>
          </div>
        </div>
      </div>
    );
  };
};
```

## 📱 iOS 구현 (Google Maps SDK)

### 1. iOS 지도 뷰 구현

```swift
import GoogleMaps
import Combine

class FamilyMapViewController: UIViewController {
    private var mapView: GMSMapView!
    private var markers: [String: GMSMarker] = [:]
    private var locationManager = CLLocationManager()
    private var cancellables = Set<AnyCancellable>()
    
    override func viewDidLoad() {
        super.viewDidLoad()
        setupGoogleMaps()
        setupLocationTracking()
        observeFamilyLocations()
    }
    
    private func setupGoogleMaps() {
        // 카메라 초기 위치 (서울)
        let camera = GMSCameraPosition.camera(
            withLatitude: 37.5665,
            longitude: 126.9780,
            zoom: 13.0
        )
        
        mapView = GMSMapView.map(withFrame: view.bounds, camera: camera)
        mapView.isMyLocationEnabled = true
        mapView.settings.myLocationButton = true
        mapView.delegate = self
        
        // 커스텀 스타일 적용
        if let styleURL = Bundle.main.url(forResource: "MapStyle", withExtension: "json") {
            mapView.mapStyle = try? GMSMapStyle(contentsOfFileURL: styleURL)
        }
        
        view.addSubview(mapView)
    }
    
    // 가족 구성원 마커 업데이트
    private func updateFamilyMemberMarker(_ member: FamilyMember) {
        guard let location = member.currentLocation else { return }
        
        let position = CLLocationCoordinate2D(
            latitude: location.latitude,
            longitude: location.longitude
        )
        
        if let existingMarker = markers[member.id] {
            // 부드러운 마커 이동 애니메이션
            CATransaction.begin()
            CATransaction.setAnimationDuration(1.0)
            existingMarker.position = position
            CATransaction.commit()
        } else {
            // 새 마커 생성
            let marker = GMSMarker(position: position)
            marker.title = member.name
            marker.snippet = member.currentStatus
            marker.icon = createMemberMarkerIcon(member)
            marker.map = mapView
            marker.userData = member
            
            markers[member.id] = marker
        }
        
        // 정보창 업데이트
        updateInfoWindow(for: member)
    }
    
    // 안전구역 표시
    private func drawSafeZones(_ safeZones: [SafeZone]) {
        safeZones.forEach { zone in
            let circle = GMSCircle(
                position: CLLocationCoordinate2D(
                    latitude: zone.latitude,
                    longitude: zone.longitude
                ),
                radius: CLLocationDistance(zone.radius)
            )
            circle.fillColor = UIColor.systemGreen.withAlphaComponent(0.2)
            circle.strokeColor = UIColor.systemGreen
            circle.strokeWidth = 2
            circle.map = mapView
            
            // 안전구역 이름 표시
            let marker = GMSMarker(position: circle.position)
            marker.icon = GMSMarker.markerImage(with: .clear)
            marker.title = zone.name
            marker.map = mapView
        }
    }
    
    // 실시간 경로 추적
    private func trackChildMovement(_ childId: String) {
        let path = GMSMutablePath()
        let polyline = GMSPolyline()
        polyline.strokeColor = .systemOrange
        polyline.strokeWidth = 3.0
        polyline.map = mapView
        
        // 실시간 위치 구독
        LocationService.shared.subscribeToChildLocation(childId)
            .receive(on: DispatchQueue.main)
            .sink { [weak self] location in
                let coordinate = CLLocationCoordinate2D(
                    latitude: location.latitude,
                    longitude: location.longitude
                )
                path.add(coordinate)
                polyline.path = path
                
                // 지도 중심 이동 (선택적)
                if self?.shouldFollowChild(childId) == true {
                    self?.mapView.animate(toLocation: coordinate)
                }
            }
            .store(in: &cancellables)
    }
}

// MARK: - GMSMapViewDelegate
extension FamilyMapViewController: GMSMapViewDelegate {
    func mapView(_ mapView: GMSMapView, didTap marker: GMSMarker) -> Bool {
        if let member = marker.userData as? FamilyMember {
            showMemberDetailView(member)
        }
        return true
    }
    
    func mapView(_ mapView: GMSMapView, markerInfoWindow marker: GMSMarker) -> UIView? {
        guard let member = marker.userData as? FamilyMember else { return nil }
        
        let infoView = FamilyMemberInfoView()
        infoView.configure(with: member)
        return infoView
    }
}
```

### 2. iOS 위치 공유 구현

```swift
// 위치 공유 매니저
class LocationSharingManager {
    static let shared = LocationSharingManager()
    
    // 위치 공유 링크 생성
    func generateShareLink(
        for members: [FamilyMember],
        duration: TimeInterval = 3600
    ) async throws -> String {
        let shareToken = try await APIClient.shared.createShareToken(
            memberIds: members.map { $0.id },
            expiresIn: duration
        )
        
        let shareURL = "\(Config.baseURL)/shared/\(shareToken)"
        return shareURL
    }
    
    // 카카오톡으로 위치 공유
    func shareViaKakaoTalk(members: [FamilyMember]) {
        Task {
            do {
                let shareURL = try await generateShareLink(for: members)
                
                // KakaoTalk SDK 사용
                let template = FeedTemplate(
                    content: Content(
                        title: "우리 가족 실시간 위치",
                        description: "\(members.count)명의 가족 위치를 확인하세요",
                        imageUrl: URL(string: Config.mapPreviewImageURL)!,
                        link: Link(
                            mobileWebUrl: URL(string: shareURL),
                            webUrl: URL(string: shareURL)
                        )
                    ),
                    buttons: [
                        Button(
                            title: "위치 확인하기",
                            link: Link(
                                mobileWebUrl: URL(string: shareURL),
                                webUrl: URL(string: shareURL)
                            )
                        )
                    ]
                )
                
                ShareApi.shared.shareDefault(templatable: template)
            } catch {
                print("공유 실패: \(error)")
            }
        }
    }
    
    // 위치 공유 보안 설정
    func configureLocationPrivacy() {
        let privacySettings = LocationPrivacySettings(
            shareRealTimeLocation: UserDefaults.standard.bool(forKey: "shareRealTime"),
            shareWithFamilyOnly: true,
            autoExpireLinks: true,
            requireAuthentication: true
        )
        
        LocationService.shared.applyPrivacySettings(privacySettings)
    }
}
```

## 🤖 Android 구현 (Google Maps SDK)

### 1. Android 지도 뷰 구현

```kotlin
@Composable
fun FamilyMapScreen(
    viewModel: FamilyMapViewModel = hiltViewModel()
) {
    val mapView = rememberMapViewWithLifecycle()
    val uiState by viewModel.uiState.collectAsState()
    
    AndroidView(
        factory = { mapView },
        modifier = Modifier.fillMaxSize()
    ) { map ->
        map.getMapAsync { googleMap ->
            setupGoogleMap(googleMap, uiState)
        }
    }
    
    // 지도 컨트롤 오버레이
    Box(modifier = Modifier.fillMaxSize()) {
        FamilyMapControls(
            onCenterFamily = { viewModel.centerOnFamily() },
            onToggleTracking = { viewModel.toggleTracking() }
        )
    }
}

class FamilyMapManager @Inject constructor(
    private val context: Context
) {
    private var googleMap: GoogleMap? = null
    private val markers = mutableMapOf<String, Marker>()
    private val polylines = mutableMapOf<String, Polyline>()
    
    fun setupMap(map: GoogleMap, familyData: FamilyMapData) {
        googleMap = map.apply {
            // 지도 설정
            uiSettings.apply {
                isZoomControlsEnabled = false
                isMyLocationButtonEnabled = true
                isCompassEnabled = true
            }
            
            // 커스텀 스타일 적용
            setMapStyle(
                MapStyleOptions.loadRawResourceStyle(
                    context, R.raw.map_style
                )
            )
            
            // 초기 카메라 위치
            moveCamera(
                CameraUpdateFactory.newLatLngZoom(
                    LatLng(37.5665, 126.9780), // 서울
                    13f
                )
            )
        }
        
        // 가족 구성원 마커 표시
        updateFamilyMarkers(familyData.members)
        
        // 안전구역 표시
        drawSafeZones(familyData.safeZones)
    }
    
    private fun updateFamilyMarkers(members: List<FamilyMember>) {
        members.forEach { member ->
            member.currentLocation?.let { location ->
                val position = LatLng(location.latitude, location.longitude)
                
                val marker = markers[member.id]
                if (marker != null) {
                    // 마커 위치 애니메이션
                    animateMarker(marker, position)
                } else {
                    // 새 마커 생성
                    val newMarker = googleMap?.addMarker(
                        MarkerOptions()
                            .position(position)
                            .title(member.name)
                            .snippet(member.currentStatus)
                            .icon(createMemberIcon(member))
                    )
                    
                    newMarker?.let {
                        it.tag = member
                        markers[member.id] = it
                    }
                }
            }
        }
    }
    
    // 실시간 경로 추적
    fun trackChildMovement(childId: String, locations: Flow<Location>) {
        val polylineOptions = PolylineOptions()
            .color(Color.parseColor("#FF5722"))
            .width(8f)
            .geodesic(true)
        
        val polyline = googleMap?.addPolyline(polylineOptions)
        polylines[childId] = polyline ?: return
        
        // 위치 업데이트 수신
        locations.onEach { location ->
            val latLng = LatLng(location.latitude, location.longitude)
            polyline?.points = polyline.points + latLng
            
            // 마커 업데이트
            updateChildMarker(childId, latLng)
            
            // 카메라 이동 (옵션)
            if (shouldFollowChild(childId)) {
                googleMap?.animateCamera(
                    CameraUpdateFactory.newLatLng(latLng)
                )
            }
        }.launchIn(GlobalScope)
    }
    
    // 안전구역 그리기
    private fun drawSafeZones(safeZones: List<SafeZone>) {
        safeZones.forEach { zone ->
            // 원형 영역
            googleMap?.addCircle(
                CircleOptions()
                    .center(LatLng(zone.latitude, zone.longitude))
                    .radius(zone.radius.toDouble())
                    .fillColor(Color.argb(50, 76, 175, 80))
                    .strokeColor(Color.argb(200, 76, 175, 80))
                    .strokeWidth(3f)
            )
            
            // 라벨 마커
            googleMap?.addMarker(
                MarkerOptions()
                    .position(LatLng(zone.latitude, zone.longitude))
                    .title(zone.name)
                    .icon(BitmapDescriptorFactory.defaultMarker(BitmapDescriptorFactory.HUE_GREEN))
                    .alpha(0f) // 투명 마커
            )
        }
    }
}
```

### 2. Android 위치 공유 구현

```kotlin
@Singleton
class LocationSharingService @Inject constructor(
    private val apiClient: ApiClient,
    private val context: Context
) {
    // 위치 공유 링크 생성
    suspend fun generateShareLink(
        memberIds: List<String>,
        duration: Long = 3600
    ): String {
        val shareToken = apiClient.createShareToken(
            CreateShareTokenRequest(
                memberIds = memberIds,
                expiresIn = duration
            )
        )
        
        return "${BuildConfig.BASE_URL}/shared/${shareToken.token}"
    }
    
    // 카카오톡 공유
    fun shareViaKakaoTalk(
        members: List<FamilyMember>,
        shareUrl: String
    ) {
        val params = FeedTemplate(
            content = Content(
                title = "우리 가족 실시간 위치",
                description = "${members.size}명의 가족 위치를 확인하세요",
                imageUrl = BuildConfig.MAP_PREVIEW_IMAGE_URL,
                link = Link(
                    webUrl = shareUrl,
                    mobileWebUrl = shareUrl
                )
            ),
            buttons = listOf(
                Button(
                    "위치 확인하기",
                    Link(
                        webUrl = shareUrl,
                        mobileWebUrl = shareUrl
                    )
                )
            )
        )
        
        // 카카오톡 공유 API 호출
        LinkClient.instance.defaultTemplate(context, params) { linkResult, error ->
            if (error != null) {
                Log.e("KakaoShare", "카카오톡 공유 실패", error)
            } else if (linkResult != null) {
                Log.d("KakaoShare", "카카오톡 공유 성공 ${linkResult.intent}")
                context.startActivity(linkResult.intent)
            }
        }
    }
    
    // 공유 보안 설정
    fun configureShareSettings() {
        val settings = LocationShareSettings(
            enableRealTimeSharing = true,
            requireAuthentication = true,
            autoExpireLinks = true,
            maxShareDuration = 86400, // 24시간
            allowedRecipients = ShareRecipients.FAMILY_ONLY
        )
        
        // 설정 적용
        LocationTrackingService.applyShareSettings(settings)
    }
}

// 위치 공유 UI 컴포넌트
@Composable
fun LocationSharingDialog(
    familyMembers: List<FamilyMember>,
    onShare: (List<FamilyMember>, Duration) -> Unit,
    onDismiss: () -> Unit
) {
    var selectedMembers by remember { mutableStateOf(familyMembers) }
    var shareDuration by remember { mutableStateOf(Duration.ofHours(1)) }
    
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("위치 공유 설정") },
        text = {
            Column {
                Text("공유할 가족 구성원을 선택하세요")
                
                familyMembers.forEach { member ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                selectedMembers = if (member in selectedMembers) {
                                    selectedMembers - member
                                } else {
                                    selectedMembers + member
                                }
                            }
                            .padding(vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Checkbox(
                            checked = member in selectedMembers,
                            onCheckedChange = null
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(member.name)
                    }
                }
                
                Spacer(modifier = Modifier.height(16.dp))
                
                Text("공유 시간")
                Row {
                    RadioButton(
                        selected = shareDuration == Duration.ofHours(1),
                        onClick = { shareDuration = Duration.ofHours(1) }
                    )
                    Text("1시간")
                    
                    Spacer(modifier = Modifier.width(16.dp))
                    
                    RadioButton(
                        selected = shareDuration == Duration.ofHours(24),
                        onClick = { shareDuration = Duration.ofHours(24) }
                    )
                    Text("24시간")
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onShare(selectedMembers, shareDuration) }
            ) {
                Text("공유하기")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("취소")
            }
        }
    )
}
```

## 🔒 보안 및 프라이버시 고려사항

### 1. 위치 정보 보안

```yaml
데이터 보안:
  - HTTPS 전송 필수
  - 위치 데이터 암호화 (AES-256)
  - 서버 저장 시 익명화
  - 90일 자동 삭제

접근 제어:
  - 가족 구성원만 접근 가능
  - 역할 기반 권한 (부모/자녀)
  - 임시 공유 링크 시간 제한
  - 2단계 인증 옵션

프라이버시:
  - 위치 정밀도 조절 가능
  - 특정 시간대 추적 중지
  - 자녀 동의 프로세스
  - 투명한 데이터 사용 고지
```

### 2. Google Maps API 보안

```javascript
// API 키 보안 설정
const secureMapConfig = {
  // 도메인 제한
  allowedDomains: ['actcs.com', '*.actcs.com'],
  
  // API 사용량 제한
  quotaLimits: {
    dailyRequests: 100000,
    requestsPerSecond: 100,
    requestsPerUser: 1000
  },
  
  // 보안 헤더
  securityHeaders: {
    'Content-Security-Policy': "default-src 'self' *.googleapis.com",
    'X-Frame-Options': 'SAMEORIGIN',
    'X-Content-Type-Options': 'nosniff'
  }
};
```

## 💰 비용 최적화 전략

### Google Maps API 비용 절감

```yaml
Maps JavaScript API:
  - 월 28,000 무료 로드
  - 초과 시 $7/1000 로드
  - 최적화: 지도 인스턴스 재사용

Geocoding API:
  - 월 40,000 무료 요청
  - 초과 시 $5/1000 요청
  - 최적화: 결과 캐싱

Directions API:
  - 월 40,000 무료 요청
  - 초과 시 $5-10/1000 요청
  - 최적화: 경로 캐싱, 배치 요청

최적화 전략:
  - 정적 지도 이미지 캐싱
  - 불필요한 재렌더링 방지
  - 사용자별 할당량 설정
  - 오프라인 지도 활용
```

## 🚀 구현 체크리스트

- [ ] Google Cloud Console에서 프로젝트 생성
- [ ] 필요한 Maps API 활성화
- [ ] API 키 생성 및 제한 설정
- [ ] 웹/iOS/Android별 SDK 통합
- [ ] 실시간 위치 추적 구현
- [ ] 안전구역 지오펜싱 구현
- [ ] 위치 공유 시스템 구현
- [ ] 카카오톡 연동 테스트
- [ ] 보안 및 프라이버시 검증
- [ ] 비용 모니터링 설정

이러한 Google Maps 통합을 통해 ACTCS는 정확하고 직관적인 위치 기반 서비스를 제공할 수 있습니다.
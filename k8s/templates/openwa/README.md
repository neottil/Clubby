curl -s http://openwa-service.openwa.svc.cluster.local:2785/api/sessions \
  -H "X-API-Key: <API-KEY>"

curl -s http://openwa-service.openwa.svc.cluster.local:2785/api/sessions/<session-id>/groups \
  -H "X-API-Key: <API-KEY>" \
  | jq '.[] | select(.name | contains("k9"))'


curl -X POST http://openwa-service.openwa.svc.cluster.local:2785/api/sessions/<session-id>/messages/send-text \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <API-KEY>" \
  -d '{"chatId": "120xxxxxx@g.us","text": "Test invio reale da OpenWA"}'
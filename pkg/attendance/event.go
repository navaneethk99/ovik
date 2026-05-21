package attendance

import "encoding/json"

type Event struct {
	Name         string `json:"name"`
	Status       string `json:"status"`
	RecognizedAt string `json:"recognized_at"`
}

func (e Event) Marshal() ([]byte, error) {
	return json.Marshal(e)
}

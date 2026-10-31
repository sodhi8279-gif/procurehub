module procurehub

go 1.24.7

require golang.org/x/crypto v0.28.0

require (
	golang.org/x/net v0.21.0 // indirect
	golang.org/x/text v0.19.0 // indirect
)

replace golang.org/x/crypto => github.com/golang/crypto v0.28.0

replace golang.org/x/net => github.com/golang/net v0.21.0

replace golang.org/x/text => github.com/golang/text v0.19.0

replace golang.org/x/sys => github.com/golang/sys v0.26.0

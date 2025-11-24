pipeline {
    agent {
        kubernetes {
            yaml '''
apiVersion: v1
kind: Pod
spec:
  containers:

  - name: node
    image: node:18
    command: ['cat']
    tty: true

  - name: sonar-scanner
    image: sonarsource/sonar-scanner-cli
    command: ['cat']
    tty: true

  - name: kubectl
    image: bitnami/kubectl:latest
    command: ['cat']
    tty: true
    env:
    - name: KUBECONFIG
      value: /kube/config
    volumeMounts:
    - name: kubeconfig-secret
      mountPath: /kube/config
      subPath: kubeconfig

  - name: dind
    image: docker:dind
    args: ["--storage-driver=overlay2"]
    securityContext:
      privileged: true
    env:
    - name: DOCKER_TLS_CERTDIR
      value: ""
  volumes:
  - name: kubeconfig-secret
    secret:
      secretName: kubeconfig-secret
'''
        }
    }

    stages {

        stage('Install + Build Frontend') {
            steps {
                container('node') {
                    sh '''
                        npm install
                        npm run build
                    '''
                }
            }
        }

        stage('Build Docker Image') {
            steps {
                container('dind') {
                    sh '''
                        sleep 10
                        docker build -t bionexa-frontend:latest .
                        docker build -t bionexa-backend:latest .
                    '''
                }
            }
        }

        stage('SonarQube Analysis') {
            steps {
                container('sonar-scanner') {
                    sh '''
                        sonar-scanner \
                            -Dsonar.projectKey=kanishk_2401042 \
                            -Dsonar.sources=. \
                            -Dsonar.host.url=http://sonarqube.imcc.com/ \
                            -Dsonar.login=sqp_e02c3cd72ed1f9c384e571a64f298437fcd4af45
                    '''
                }
            }
        }


        stage('Login to Nexus Registry') {
            steps {
                container('dind') {
                    sh '''
                        docker login nexus-service-for-docker-hosted-registry.nexus.svc.cluster.local:8085 -u admin -p Changeme@2025
                    '''
                }
            }
        }


        stage('Push to Nexus') {
            steps {
                container('dind') {
                    sh '''
                        docker tag bionexa-frontend:latest:latest nexus-service-for-docker-hosted-registry.nexus.svc.cluster.local:8085/bionexa_kansihk/bionexa-frontend:latest:v1
                        docker tag bionexa-backend:latest:latest nexus-service-for-docker-hosted-registry.nexus.svc.cluster.local:8085/bionexa_kansihk/bionexa-backend:latest:v1
                        docker push nexus-service-for-docker-hosted-registry.nexus.svc.cluster.local:8085/2401199/recipe-finder:v1
                    '''
                }
            }
        }

        // stage('Deploy to Kubernetes') {
        //     steps {
        //         container('kubectl') {
        //             sh '''
        //                 kubectl apply -f k8s/deployment.yaml
        //                 kubectl apply -f k8s/service.yaml

        //                 kubectl rollout status deployment/recipe-finder-deployment -n 2401199
        //             '''
        //         }
        //     }
        // }
    }
}